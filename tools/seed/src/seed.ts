import { createHmac } from 'node:crypto';
import { seedSecret, saveState, BACKEND, type SeedState, type PersonaState } from './config.ts';
import {
  ADMIN, ANNOUNCEMENTS, BOT_NAME, CATEGORIES, CHANNEL_SIZES, DEV, EMOJI_NAMES, LINKS, LONG_MESSAGE,
  MARKDOWN_SHOWCASE, P, PERSONAS, ROLES, RULES, TOTP, UNICODE_REACTIONS, bank, bits, type Persona,
} from './data.ts';
import { api, upload, type Auth } from './http.ts';
import { makeClips } from './media.ts';
import { emojiShape, gradient, identicon, testCard } from './png.ts';
import { Rng } from './rng.ts';
import { totp } from './totp.ts';
import { createAccount, setServerCreators, verificationToken } from './vps.ts';

export const FIRST_DOMAIN = 'seed.concord.test';
export const FALLBACK_DOMAIN = 'concord.jaalip.com';

/** Each persona's password: HMAC(SEED_SECRET, handle). Never a fixed string, because the server is public. */
export function passwordFor(handle: string): string {
  return createHmac('sha256', seedSecret()).update(handle).digest('base64url').slice(0, 32);
}

interface User { _id: string; username: string; discriminator: string }
export interface Live { handle: string; email: string; auth: Auth; user: User }

const log = (...a: unknown[]) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);

async function pool<T, R>(items: T[], size: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!, i);
    }
  }));
  return out;
}

export async function login(email: string, password: string): Promise<{ token: string; user_id: string }> {
  const res = await api<{ result: string; token: string; user_id: string }>('POST', '/auth/session/login', {
    body: { email, password, friendly_name: 'Concord seed' },
  });
  if (res.result !== 'Success') throw new Error(`login for ${email}: ${res.result}`);
  return res;
}

/** Create, verify, sign in and onboard one account. */
export async function makeAccount(handle: string, username: string, domain: string): Promise<Live> {
  const email = `${handle}@${domain}`;
  const password = passwordFor(handle);
  const started = new Date();
  await createAccount(email, password);
  const token = await verificationToken(email, started);
  const verified = await api<{ ticket?: { token: string } } | null>('POST', `/auth/account/verify/${token}`);
  const session = verified?.ticket
    ? await api<{ token: string }>('POST', '/auth/session/login', { body: { mfa_ticket: verified.ticket.token, friendly_name: 'Concord seed' } })
    : await login(email, password);
  const auth = { session: session.token };
  const user = await api<User>('POST', '/onboard/complete', { auth, body: { username } });
  return { handle, email, auth, user };
}

const tag = (u: User) => `${u.username}#${u.discriminator}`;

export async function seed(): Promise<SeedState> {
  seedSecret(true);
  const rng = new Rng(20261012);
  const t0 = Date.now();

  // 1. Bootstrap: the admin first, then server creation limited to it.
  log('creating dev-admin');
  let domain = FIRST_DOMAIN;
  let admin: Live;
  const adminPersona = PERSONAS.find((p) => p.handle === ADMIN)!;
  try {
    admin = await makeAccount(ADMIN, adminPersona.username, domain);
  } catch (e) {
    log(`${FIRST_DOMAIN} refused (${(e as Error).message.slice(0, 120)}), using ${FALLBACK_DOMAIN}`);
    domain = FALLBACK_DOMAIN;
    admin = await makeAccount(ADMIN, adminPersona.username, domain);
  }
  await setServerCreators([admin.user._id]);
  log(`admin ${tag(admin.user)}, emails @${domain}`);

  // 2. Everyone else.
  const rest = PERSONAS.filter((p) => p.handle !== ADMIN);
  const others = await pool(rest, 3, async (p) => {
    const live = await makeAccount(p.handle, p.username, domain);
    log(`created ${tag(live.user)}`);
    return live;
  });
  const people = new Map<string, Live>([[ADMIN, admin], ...others.map((l) => [l.handle, l] as const)]);
  const live = (h: string) => people.get(h)!;

  // 3. Profiles: one PATCH each, because profile edits allow 2 per 10 seconds.
  log('profiles');
  await pool(PERSONAS, 4, async (p) => {
    const l = live(p.handle);
    const edit = await seededProfile(p, l.auth);
    if (Object.keys(edit).length) await api('PATCH', '/users/@me', { auth: l.auth, body: edit });
  });

  // 4. The server.
  log('server');
  const A = admin.auth;
  const created = await api<{ server: { _id: string; default_permissions: number }; channels: { _id: string }[] }>(
    'POST', '/servers/create', { auth: A, body: { name: 'Concord', description: 'Concordin kehityspalvelin. The Concord development server.' } },
  );
  const serverId = created.server._id;
  const defaults = BigInt(created.server.default_permissions) & ~bits(P.InviteOthers);
  await api('PUT', `/servers/${serverId}/permissions/default`, { auth: A, body: { permissions: Number(defaults) } });

  const roles: Record<string, string> = {};
  for (const [rank, role] of ROLES.entries()) {
    const r = await api<{ id: string }>('POST', `/servers/${serverId}/roles`, { auth: A, body: { name: role.name, rank } });
    roles[role.name] = r.id;
    await api('PATCH', `/servers/${serverId}/roles/${r.id}`, { auth: A, body: { colour: role.colour, hoist: role.hoist } });
  }
  await api('PUT', `/servers/${serverId}/permissions/${roles.Admin}`, { auth: A, body: { permissions: { allow: Number(bits(P.InviteOthers)), deny: 0 } } });
  const modBits = bits(P.KickMembers, P.BanMembers, P.TimeoutMembers, P.ManageNicknames, P.RemoveAvatars, P.ManageMessages, P.MuteMembers, P.DeafenMembers, P.MoveMembers, P.MentionEveryone, P.MentionRoles);
  await api('PUT', `/servers/${serverId}/permissions/${roles.Moderaattori}`, { auth: A, body: { permissions: { allow: Number(modBits), deny: 0 } } });

  const channels: Record<string, string> = {};
  const categories = [];
  let defaultChannelUsed = false;
  for (const [ci, cat] of CATEGORIES.entries()) {
    const ids: string[] = [];
    for (const ch of cat.channels) {
      let id: string;
      if (ch.key === 'yleinen' && !defaultChannelUsed) {
        id = created.channels[0]!._id;
        defaultChannelUsed = true;
        await api('PATCH', `/channels/${id}`, { auth: A, body: { name: ch.name } });
      } else {
        const body: Record<string, unknown> = { type: 'voice' in ch ? 'Voice' : 'Text', name: ch.name };
        if ('description' in ch) body.description = ch.description;
        id = (await api<{ _id: string }>('POST', `/servers/${serverId}/channels`, { auth: A, body }))._id;
      }
      channels[ch.key] = id;
      ids.push(id);
      if ('readOnly' in ch) {
        await api('PUT', `/channels/${id}/permissions/default`, { auth: A, body: { permissions: { allow: 0, deny: Number(bits(P.SendMessage)) } } });
        await api('PUT', `/channels/${id}/permissions/${roles.Moderaattori}`, { auth: A, body: { permissions: { allow: Number(bits(P.SendMessage)), deny: 0 } } });
      }
    }
    categories.push({ id: `cat${ci}`, title: cat.title, channels: ids });
  }
  const icon = await upload(A, 'icons', 'icon.png', identicon(new Rng(7), 256), 'image/png');
  const banner = await upload(A, 'banners', 'banner.png', gradient(new Rng(8), 960, 540), 'image/png');
  await api('PATCH', `/servers/${serverId}`, {
    auth: A,
    body: {
      categories, icon, banner,
      system_messages: { user_joined: channels.botti, user_left: channels.botti, user_kicked: channels.botti, user_banned: channels.botti },
    },
  });
  const invite = await api<{ _id: string }>('POST', `/channels/${channels.yleinen}/invites`, { auth: A });

  // 5. Members join through the one invite, then get their roles.
  log('members');
  await pool(others, 4, (l) => api('POST', `/invites/${invite._id}`, { auth: l.auth }));
  for (const p of PERSONAS) {
    if (!p.roles.length) continue;
    await api('PATCH', `/servers/${serverId}/members/${live(p.handle).user._id}`, { auth: A, body: { roles: p.roles.map((r) => roles[r]) } });
  }

  // 6. Custom emoji.
  log('emoji');
  const emoji: Record<string, string> = {};
  for (const [i, name] of EMOJI_NAMES.entries()) {
    const id = await upload(A, 'emojis', `${name}.png`, emojiShape(new Rng(100 + i), i), 'image/png');
    await api('PUT', `/custom/emoji/${id}`, { auth: A, body: { name, parent: { type: 'Server', id: serverId } } });
    emoji[name] = id;
  }

  // 7. A bot account owned by the admin.
  log('bot');
  const bot = await api<{ _id: string; token: string; user: User }>('POST', '/bots/create', { auth: A, body: { name: BOT_NAME } });
  const botAuth: Auth = { bot: bot.token };
  await api('POST', `/bots/${bot._id}/invite`, { auth: A, body: { server: serverId } });
  await api('PATCH', `/servers/${serverId}/members/${bot._id}`, { auth: A, body: { roles: [roles.Botit] } });
  try {
    const avatar = await upload(botAuth, 'avatars', 'kello.png', identicon(new Rng(9)), 'image/png');
    await api('PATCH', '/users/@me', { auth: botAuth, body: { avatar, display_name: 'Kello' } });
  } catch (e) {
    log('bot avatar skipped:', (e as Error).message.slice(0, 120));
  }

  // 8. Friendships, sent and accepted in pairs: new accounts may only have 5 pending outgoing requests.
  log('friends');
  const befriend = async (a: string, b: string) => {
    await api('POST', '/users/friend', { auth: live(a).auth, body: { username: tag(live(b).user) } });
    await api('PUT', `/users/${live(a).user._id}/friend`, { auth: live(b).auth });
  };
  const devFriends = ['aino', 'ben', 'eetu', 'sanna', 'juho', 'emma', 'oliver', 'noora', 'maija', TOTP, 'lauri', 'sofia'];
  for (const f of devFriends) await befriend(DEV, f);
  const pairRng = new Rng(4242);
  const pool2 = rest.map((p) => p.handle).filter((h) => h !== DEV && h !== 'jack');
  const pairs = new Set<string>();
  while (pairs.size < 25) {
    const [a, b] = [pairRng.pick(pool2), pairRng.pick(pool2)];
    if (a !== b && !pairs.has(`${b}|${a}`)) pairs.add(`${a}|${b}`);
  }
  for (const pair of pairs) {
    const [a, b] = pair.split('|') as [string, string];
    await befriend(a, b);
  }
  for (const from of ['ville', 'kaisa']) await api('POST', '/users/friend', { auth: live(from).auth, body: { username: tag(live(DEV).user) } });
  await api('POST', '/users/friend', { auth: live(DEV).auth, body: { username: tag(live('mikko').user) } });
  await api('PUT', `/users/${live('jack').user._id}/block`, { auth: live(DEV).auth });

  // 9. Messages.
  const ids = { user: (h: string) => live(h).user._id, role: (n: string) => roles[n]!, channel: (k: string) => channels[k]!, emoji: (n: string) => emoji[n]! };
  const fill = (s: string) => s.replace(/\{(user|role|channel|emoji):([^}]+)\}/g, (_, kind: keyof typeof ids, key: string) => ids[kind](key));
  const clips = await makeClips();
  const chatters = PERSONAS.filter((p) => p.handle !== ADMIN || rng.chance(0.5));
  const sent: Record<string, { id: string; author: string }[]> = {};

  const send = async (channel: string, author: string, body: Record<string, unknown>) => {
    const auth = author === BOT_NAME ? botAuth : live(author).auth;
    const m = await api<{ _id: string }>('POST', `/channels/${channel}/messages`, { auth, body });
    return m._id;
  };

  const script = (key: string): { author: string; body: Record<string, unknown> }[] => {
    const r = new Rng(hash(key));
    const n = CHANNEL_SIZES[key] ?? 0;
    const lines = bank(key);
    const out: { author: string; body: Record<string, unknown> }[] = [];
    if (key === 'saannot') return RULES.map((content) => ({ author: ADMIN, body: { content } }));
    if (key === 'ilmoitukset') return ANNOUNCEMENTS.map((c, i) => ({ author: i % 2 ? 'aino' : ADMIN, body: { content: fill(c) } }));
    let prev = '';
    for (let i = 0; i < n; i++) {
      const author = key === 'botti'
        ? (r.chance(0.8) ? BOT_NAME : r.pick(chatters).handle)
        : prev && r.chance(0.4) ? prev : weighted(r, chatters);
      prev = author;
      let content = r.pick(author === BOT_NAME ? bank('botti') : lines);
      if (r.chance(0.06)) content = `<@${ids.user(r.pick(PERSONAS).handle)}> ${content}`;
      // Role mentions need MentionRoles, which only moderators have.
      if (['aino', 'ben'].includes(author) && r.chance(0.1)) content += ` <%${ids.role(r.pick(ROLES).name)}>`;
      if (r.chance(0.02)) content += ` <#${ids.channel(r.pick(['yleinen', 'pelit', 'tekniikka']))}>`;
      if (r.chance(0.07)) content += ` :${ids.emoji(r.pick(EMOJI_NAMES))}:`;
      if (r.chance(0.02)) content += ` ||${r.pick(lines)}||`;
      if (key !== 'botti' && r.chance(0.025)) content += ` ${r.pick(LINKS)}`;
      const body: Record<string, unknown> = { content };
      if (i > 3 && r.chance(0.12)) body.replies = [{ index: r.int(Math.max(0, i - 15), i), mention: r.chance(0.5) }];
      out.push({ author, body });
    }
    if (key === 'yleinen') out.splice(100, 0, { author: 'emma', body: { content: LONG_MESSAGE } });
    if (key === 'tekniikka') MARKDOWN_SHOWCASE.forEach((c, i) => out.splice(10 + i, 0, { author: 'ben', body: { content: fill(c) } }));
    if (key === 'pelit') out.push({ author: 'eetu', body: { content: `<@${ids.user(DEV)}> lähdetkö mukaan illalla?` } });
    return out;
  };

  const images = async (author: string, sizes: [number, number][]) => {
    const auth = live(author).auth;
    return Promise.all(sizes.map(([w, h], i) => upload(auth, 'attachments', `kuva-${w}x${h}-${i}.png`, testCard(new Rng(w * h + i), w, h), 'image/png')));
  };

  log('messages');
  const textKeys = Object.keys(CHANNEL_SIZES);
  await Promise.all(textKeys.map(async (key) => {
    const chan = channels[key]!;
    const items = script(key);
    const list: { id: string; author: string }[] = [];
    for (const [i, item] of items.entries()) {
      const body = { ...item.body };
      if (Array.isArray(body.replies)) {
        const [rep] = body.replies as { index: number; mention: boolean }[];
        const target = list[rep!.index];
        body.replies = target ? [{ id: target.id, mention: rep!.mention }] : undefined;
      }
      if (key === 'kuvat' && i % 3 === 0 && item.author !== BOT_NAME) {
        const sizes: [number, number][][] = [[[40, 40]], [[3000, 500]], [[500, 1600]], [[1920, 1080]], [[800, 600], [600, 800]], [[256, 256], [1024, 768], [300, 300], [640, 360]], [[1, 1]], [[1200, 400]]];
        body.attachments = await images(item.author, sizes[(i / 3) % sizes.length]!);
      }
      list.push({ id: await send(chan, item.author, body), author: item.author });
    }
    sent[key] = list;
    log(`  ${key}: ${list.length}`);
  }));
  // Video and audio attachments.
  const video = await upload(live('sanna').auth, 'attachments', 'video.mp4', clips.video, 'video/mp4');
  sent.kuvat!.push({ id: await send(channels.kuvat!, 'sanna', { content: 'video testi', attachments: [video] }), author: 'sanna' });
  const audio = await upload(live('juho').auth, 'attachments', 'aani.ogg', clips.audio, 'audio/ogg');
  sent.offtopic!.push({ id: await send(channels.offtopic!, 'juho', { content: 'kuunnelkaa tää', attachments: [audio] }), author: 'juho' });

  // 10. DMs and a group.
  log('dms');
  const dmLines = bank('dm');
  const dms: Record<string, string> = {};
  for (const partner of ['aino', 'eetu', 'emma', 'juho', 'sanna']) {
    const dm = await api<{ _id: string }>('GET', `/users/${ids.user(partner)}/dm`, { auth: live(DEV).auth });
    dms[partner] = dm._id;
    const r = new Rng(hash(`dm-${partner}`));
    for (let i = 0; i < 10; i++) await send(dm._id, r.chance(0.5) ? DEV : partner, { content: r.pick(dmLines) });
  }
  const group = await api<{ _id: string }>('POST', '/channels/create', {
    auth: live(DEV).auth,
    body: { name: 'Sauna-ilta', description: 'Perjantain saunavuoro', users: ['aino', 'eetu', 'emma', 'juho'].map(ids.user) },
  });
  const gr = new Rng(hash('group'));
  for (let i = 0; i < 30; i++) await send(group._id, gr.pick([DEV, 'aino', 'eetu', 'emma', 'juho']), { content: gr.pick(dmLines) });

  // 11. Reactions, edits, pins and one deletion.
  log('reactions, edits, pins');
  const members = PERSONAS.map((p) => p.handle);
  for (const key of ['yleinen', 'offtopic', 'pelit', 'tekniikka', 'kuvat', 'ilmoitukset']) {
    const r = new Rng(hash(`react-${key}`));
    const list = sent[key]!;
    for (const m of list) {
      if (!r.chance(key === 'ilmoitukset' ? 0.8 : 0.12)) continue;
      const kinds = r.int(1, 4);
      for (let k = 0; k < kinds; k++) {
        const e = r.chance(0.5) ? encodeURIComponent(r.pick(UNICODE_REACTIONS)) : ids.emoji(r.pick(EMOJI_NAMES));
        const reactors = r.shuffle([...members]).slice(0, r.int(1, 6));
        for (const who of reactors) await api('PUT', `/channels/${channels[key]}/messages/${m.id}/reactions/${e}`, { auth: live(who).auth });
      }
    }
    for (const m of list) {
      if (m.author === BOT_NAME || !r.chance(0.02)) continue;
      await api('PATCH', `/channels/${channels[key]}/messages/${m.id}`, { auth: live(m.author).auth, body: { content: `${r.pick(bank(key))} (korjattu)` } });
    }
  }
  const pins: [string, number][] = [['yleinen', 5], ['yleinen', 60], ['yleinen', 150], ['tekniikka', 10], ['tekniikka', 11], ['ilmoitukset', 0], ['saannot', 0]];
  for (const [key, index] of pins) await api('POST', `/channels/${channels[key]}/messages/${sent[key]![index]!.id}/pin`, { auth: A });
  const doomed = sent.offtopic![40]!;
  if (doomed.author !== BOT_NAME) await api('DELETE', `/channels/${channels.offtopic}/messages/${doomed.id}`, { auth: live(doomed.author).auth });

  // 12. Acknowledgements for dev: everything read except the tail of yleinen, pelit with its mention, and one DM.
  log('acks');
  const D = live(DEV).auth;
  for (const key of textKeys) {
    const list = sent[key]!;
    const keep = key === 'yleinen' ? 20 : key === 'pelit' ? 6 : 0;
    // Pins and joins post system messages after the seeded ones, so "read" means up to the channel's real last message.
    const [latest] = keep ? [] : await api<{ _id: string }[]>('GET', `/channels/${channels[key]}/messages?limit=1`, { auth: D });
    const target = latest?._id ?? list[list.length - 1 - keep]?.id;
    if (target) await api('PUT', `/channels/${channels[key]}/ack/${target}`, { auth: D });
  }
  for (const [partner, dm] of Object.entries(dms)) {
    if (partner === 'eetu') continue;
    const last = await api<{ _id: string }[]>('GET', `/channels/${dm}/messages?limit=1`, { auth: D });
    if (last[0]) await api('PUT', `/channels/${dm}/ack/${last[0]._id}`, { auth: D });
  }

  const personas: Record<string, PersonaState> = {};
  for (const p of PERSONAS) {
    const l = live(p.handle);
    personas[p.handle] = { handle: p.handle, email: l.email, userId: l.user._id, username: tag(l.user) };
  }
  personas[BOT_NAME] = { handle: BOT_NAME, email: '', userId: bot._id, username: tag(bot.user), botToken: bot.token };
  const state: SeedState = {
    backend: BACKEND, seededAt: new Date().toISOString(), emailDomain: domain, serverId, inviteCode: invite._id,
    channels: { ...channels, ...Object.fromEntries(Object.entries(dms).map(([k, v]) => [`dm-${k}`, v])) },
    roles, emoji, groupId: group._id, personas,
  };
  saveState(state);

  // 13. TOTP for the totp persona, last, since its later logins need a code. State is saved first, so a failure
  // here loses nothing else. Stoat accepts only the current 30-second window, so answer mid-window.
  log('totp');
  const T = live(TOTP).auth;
  const ticket = await api<{ token: string }>('PUT', '/auth/mfa/ticket', { auth: T, body: { password: passwordFor(TOTP) } });
  const { secret } = await api<{ secret: string }>('POST', '/auth/mfa/totp', { auth: T, headers: { 'x-mfa-ticket': ticket.token } });
  for (let attempt = 0; ; attempt++) {
    const into = Date.now() % 30_000;
    if (into < 8_000 || into > 20_000) await new Promise((r) => setTimeout(r, (38_000 - into) % 30_000));
    try {
      await api('PUT', '/auth/mfa/totp', { auth: T, body: { totp_code: totp(secret) } });
      break;
    } catch (e) {
      if (attempt >= 1) throw e;
    }
  }
  state.personas[TOTP]!.totpSecret = secret;
  saveState(state);
  const total = Object.values(sent).reduce((n, l) => n + l.length, 0) + 50 + 30;
  log(`done: ${PERSONAS.length} personas, ${total} messages, ${Math.round((Date.now() - t0) / 1000)} s`);
  return state;
}

function weighted(r: Rng, people: Persona[]): string {
  const total = people.reduce((n, p) => n + p.weight, 0);
  let x = r.next() * total;
  for (const p of people) if ((x -= p.weight) < 0) return p.handle;
  return people[people.length - 1]!.handle;
}

/**
 * A persona's seeded profile as one `PATCH /users/@me` body, with its images uploaded again. They come out
 * the same every time, so live checks use this to put a persona back as seeded.
 */
export async function seededProfile(p: Persona, auth: Auth): Promise<Record<string, unknown>> {
  const r = new Rng(hash(p.handle));
  const edit: Record<string, unknown> = {};
  if (p.displayName) edit.display_name = p.displayName;
  if (p.avatar) edit.avatar = await upload(auth, 'avatars', `${p.handle}.png`, identicon(r), 'image/png');
  const profile: Record<string, string> = {};
  if (p.bio) profile.content = p.bio;
  if (p.banner) profile.background = await upload(auth, 'backgrounds', `${p.handle}-banner.png`, gradient(r, 960, 384), 'image/png');
  if (Object.keys(profile).length) edit.profile = profile;
  if (p.status || p.presence) edit.status = { ...(p.status ? { text: p.status } : {}), ...(p.presence ? { presence: p.presence } : {}) };
  return edit;
}

function hash(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
