/**
 * M0 verifications on the seeded stack (docs/m0-plan.md). Prints results as JSON for docs/m0-results.md.
 * Run with `pnpm seed check` after a fresh `pnpm seed --reset`. It changes a little state: one persona's
 * status, one temporary friendship and DM, and a few test messages that it deletes again.
 */
import { gzipSync } from 'node:zlib';
import { BACKEND, loadState, type SeedState } from './config.ts';
import { api, ApiError, type Auth } from './http.ts';
import { login, passwordFor } from './seed.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const WS = `${BACKEND.replace(/^http/, 'ws')}/ws?version=1&format=json`;
const CLIENT_FIELDS = ['users', 'servers', 'channels', 'members', 'emojis', 'voice_states', 'channel_unreads', 'policy_changes'];

interface Frame { type: string; [k: string]: unknown }

async function auth(state: SeedState, handle: string): Promise<{ token: string; auth: Auth }> {
  const { token } = await login(state.personas[handle]!.email, passwordFor(handle));
  return { token, auth: { session: token } };
}

function open(token: string, query = ''): Promise<{ ws: WebSocket; frames: Frame[]; ready: string }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS}${query ? `&${query}` : ''}`);
    const frames: Frame[] = [];
    ws.onopen = () => ws.send(JSON.stringify({ type: 'Authenticate', token }));
    ws.onmessage = (ev) => {
      const text = String(ev.data);
      const frame = JSON.parse(text) as Frame;
      if (frame.type === 'Ready') resolve({ ws, frames, ready: text });
      else frames.push(frame);
    };
    ws.onerror = () => reject(new Error('socket error'));
  });
}

async function presence(state: SeedState) {
  // Actor: lotta. Observers: a friend, a server member who is not a friend, and a DM partner who is not a friend.
  const actor = await auth(state, 'lotta');
  const friend = await auth(state, 'helmi');
  const member = await auth(state, 'dev');
  const partner = await auth(state, 'pekka');
  const ids = { lotta: state.personas.lotta!.userId, helmi: state.personas.helmi!.userId, pekka: state.personas.pekka!.userId };

  // Friendship with helmi, kept. A DM with pekka: befriend, open the DM, talk, then unfriend.
  await api('POST', '/users/friend', { auth: actor.auth, body: { username: state.personas.helmi!.username } }).catch(() => {});
  await api('PUT', `/users/${ids.lotta}/friend`, { auth: friend.auth }).catch(() => {});
  let dmWithoutFriendship = 'allowed';
  try {
    await api('GET', `/users/${ids.pekka}/dm`, { auth: actor.auth });
  } catch (e) {
    dmWithoutFriendship = `refused: ${(e as ApiError).status} ${JSON.stringify((e as ApiError).body)}`;
  }
  await api('POST', '/users/friend', { auth: actor.auth, body: { username: state.personas.pekka!.username } });
  await api('PUT', `/users/${ids.lotta}/friend`, { auth: partner.auth });
  const dm = await api<{ _id: string }>('GET', `/users/${ids.pekka}/dm`, { auth: actor.auth });
  await api('POST', `/channels/${dm._id}/messages`, { auth: actor.auth, body: { content: 'moi, testataan' } });
  await api('DELETE', `/users/${ids.pekka}/friend`, { auth: actor.auth });
  let dmAfterUnfriend = 'sent';
  try {
    await api('POST', `/channels/${dm._id}/messages`, { auth: partner.auth, body: { content: 'vieläkö toimii?' } });
  } catch (e) {
    dmAfterUnfriend = `refused: ${(e as ApiError).status} ${JSON.stringify((e as ApiError).body)}`;
  }

  // Fresh sockets after the relationships settled.
  const observers = {
    friend: await open(friend.token),
    'server member, not friend': await open(member.token),
    'DM partner, not friend': await open(partner.token),
  };
  for (const o of Object.values(observers)) o.frames.length = 0;

  const results: Record<string, Record<string, string>> = {};
  const changes: [string, Record<string, unknown>][] = [
    ['Idle', { status: { presence: 'Idle' } }],
    ['Focus', { status: { presence: 'Focus' } }],
    ['Busy', { status: { presence: 'Busy' } }],
    ['status text', { status: { text: 'Tarkistus käynnissä', presence: 'Online' } }],
    ['Online', { status: { presence: 'Online' } }],
  ];
  for (const [label, body] of changes) {
    for (const o of Object.values(observers)) o.frames.length = 0;
    await api('PATCH', '/users/@me', { auth: actor.auth, body });
    await sleep(2500);
    results[label] = {};
    for (const [who, o] of Object.entries(observers)) {
      const hit = o.frames.find((f) => f.type === 'UserUpdate' && f.id === ids.lotta);
      results[label]![who] = hit ? `live: ${JSON.stringify(hit.data)}` : 'nothing';
    }
    await sleep(3000);
  }
  // Disconnect fan-out, for completeness.
  for (const o of Object.values(observers)) o.frames.length = 0;
  const actorSocket = await open(actor.token);
  await sleep(1500);
  for (const o of Object.values(observers)) o.frames.length = 0;
  actorSocket.ws.close();
  await sleep(2500);
  results['disconnect'] = Object.fromEntries(Object.entries(observers).map(([who, o]) => [who,
    o.frames.find((f) => f.type === 'UserUpdate' && f.id === ids.lotta) ? 'live' : 'nothing']));
  // Stoat's Subscribe frame (architecture section 4.3): does it bring status changes to a non-friend member?
  const member2 = observers['server member, not friend'];
  member2.ws.send(JSON.stringify({ type: 'Subscribe', server_id: state.serverId }));
  await sleep(1000);
  member2.frames.length = 0;
  await api('PATCH', '/users/@me', { auth: actor.auth, body: { status: { text: 'Tilaustesti', presence: 'Busy' } } });
  await sleep(2500);
  const subscribed = member2.frames.find((f) => f.type === 'UserUpdate' && f.id === ids.lotta);
  const afterSubscribe = { 'server member, not friend, after Subscribe': subscribed ? `live: ${JSON.stringify(subscribed.data)}` : 'nothing',
    socketOpen: member2.ws.readyState === WebSocket.OPEN };
  for (const o of Object.values(observers)) o.ws.close();
  await sleep(5500);
  await api('PATCH', '/users/@me', { auth: actor.auth, body: { status: { presence: 'Online' }, remove: ['StatusText'] } }).catch(() => {});
  return { dmWithoutFriendship, dmAfterUnfriend, fanOut: results, afterSubscribe };
}

async function readySize(state: SeedState) {
  const dev = await auth(state, 'dev');
  const out: Record<string, unknown> = {};
  for (const [label, query] of [['default fields', ''], ['client fields', CLIENT_FIELDS.map((f) => `ready=${f}`).join('&')]] as const) {
    const { ws, ready: raw } = await open(dev.token, query);
    const ready = JSON.parse(raw) as Record<string, unknown[]>;
    out[label] = {
      bytes: Buffer.byteLength(raw),
      gzipped: gzipSync(raw).length,
      counts: Object.fromEntries(Object.entries(ready).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.length])),
    };
    ws.close();
  }
  return out;
}

async function inviteIcon(state: SeedState) {
  const res = await api<Record<string, unknown>>('GET', `/invites/${state.inviteCode}`);
  return { fields: Object.keys(res), server_icon: res.server_icon ?? null, server_banner: res.server_banner ?? null };
}

async function messageLimit(state: SeedState) {
  const dev = await auth(state, 'dev');
  const ch = state.channels.botti!;
  const out: Record<string, string> = {};
  for (const [label, content] of [
    ['2000 ASCII characters', 'a'.repeat(2000)],
    ['2001 ASCII characters', 'a'.repeat(2001)],
    ['1000 × ä (2000 bytes)', 'ä'.repeat(1000)],
    ['1001 × ä (1001 characters, 2002 bytes)', 'ä'.repeat(1001)],
  ] as const) {
    try {
      const m = await api<{ _id: string }>('POST', `/channels/${ch}/messages`, { auth: dev.auth, body: { content } });
      out[label] = 'accepted';
      await api('DELETE', `/channels/${ch}/messages/${m._id}`, { auth: dev.auth });
    } catch (e) {
      out[label] = `refused: ${(e as ApiError).status} ${JSON.stringify((e as ApiError).body)}`;
    }
  }
  return out;
}

export async function checks(): Promise<void> {
  const state = loadState();
  if (!state) throw new Error('no seed state; run pnpm seed --reset first');
  const result = {
    messageLimit: await messageLimit(state),
    inviteIcon: await inviteIcon(state),
    readySize: await readySize(state),
    presence: await presence(state),
  };
  console.log(JSON.stringify(result, null, 2));
}
