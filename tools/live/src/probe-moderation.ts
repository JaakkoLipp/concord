/**
 * m4.7-plan.md task 1, the API-side probes, on a throwaway server owned by `dev-admin` with `tuuli`, `onni` and
 * `dev` as members. Nothing seeded is touched. The answers go in docs/m4.7-results.md.
 * `node tools/live/src/probe-moderation.ts [ranks|history|ban|all]`
 */
import { assertDevStack } from '../../seed/src/vps.ts';
import { ApiError, api } from '../../seed/src/http.ts';
import { Permission as P } from '../../../packages/domain/src/permissions.ts';
import { person, type Person } from './people.ts';
import { serversOf } from './servers.ts';

await assertDevStack();

export const PROBE = 'm47-probe';
const num = (b: bigint) => Number(b);

/** What a request answers, as a short string: the status and Stoat's error type. */
export async function answer(p: Promise<unknown>): Promise<string> {
  try {
    const r = await p;
    return r === null || r === undefined || r === '' ? 'ok (no body)' : 'ok';
  } catch (e) {
    if (e instanceof ApiError) return `${e.status} ${(e.body as { type?: string; location?: string } | null)?.type ?? JSON.stringify(e.body)}`;
    throw e;
  }
}

export interface Probe {
  owner: Person; mod: Person; target: Person; plain: Person;
  server: string; text: string; voiceA: string; voiceB: string; modRole: string;
}

/** Deletes the owner's probe servers left by an earlier run, and takes the others out of them. */
export async function sweepProbe(owner: Person, others: Person[]): Promise<void> {
  for (const s of await serversOf(owner)) if (s.owner === owner.id && s.name.startsWith(PROBE)) await owner.call('DELETE', `/servers/${s._id}`).catch(() => {});
  for (const p of others) for (const s of await serversOf(p)) if (s.name.startsWith(PROBE)) await p.call('DELETE', `/servers/${s._id}?leave_silently=true`).catch(() => {});
}

/**
 * A server with text channel, voice channels A and B, and a Moderator role (rank 1) held by `onni`:
 * move, mute, deafen, timeout, kick, ban, manage messages and nicknames, and view audit logs.
 */
export async function setup(): Promise<Probe> {
  const [owner, target, mod, plain] = await Promise.all(['dev-admin', 'tuuli', 'onni', 'dev'].map(person)) as [Person, Person, Person, Person];
  await sweepProbe(owner, [target, mod, plain]);
  const r = await owner.call<{ server: { _id: string }; channels: { _id: string }[] }>('POST', '/servers/create', { name: `${PROBE} ${Date.now() % 100000}` });
  const server = r.server._id;
  const text = r.channels[0]!._id;
  const voice = (name: string) => owner.call<{ _id: string }>('POST', `/servers/${server}/channels`, { type: 'Voice', name }).then((c) => c._id);
  const [voiceA, voiceB] = [await voice('Alpha'), await voice('Beta')] as [string, string];
  const modRole = (await owner.call<{ id: string }>('POST', `/servers/${server}/roles`, { name: 'Moderator' })).id;
  const allow = P.MoveMembers | P.MuteMembers | P.DeafenMembers | P.TimeoutMembers | P.KickMembers | P.BanMembers | P.ManageMessages | P.ManageNicknames | P.ViewAuditLogs | P.AssignRoles;
  await owner.call('PUT', `/servers/${server}/permissions/${modRole}`, { permissions: { allow: num(allow), deny: 0 } });
  const invite = await owner.call<{ _id: string }>('POST', `/channels/${text}/invites`);
  for (const p of [target, mod, plain]) await p.call('POST', `/invites/${invite._id}`);
  await owner.call('PATCH', `/servers/${server}/members/${mod.id}`, { roles: [modRole] });
  return { owner, mod, target, plain, server, text, voiceA, voiceB, modRole };
}

export async function cleanup(p: Probe): Promise<void> {
  await p.owner.call('DELETE', `/servers/${p.server}`).catch(() => {});
}

const section = process.argv[2] ?? 'all';
if (import.meta.url === `file://${process.argv[1]}`) {
  const p = await setup();
  const out: Record<string, unknown> = {};
  try {
    if (section === 'ranks' || section === 'all') {
      // The owner holds no roles; a moderator (rank 1) edits the owner and a peer below.
      out['mod edits owner nickname'] = await answer(p.mod.call('PATCH', `/servers/${p.server}/members/${p.owner.id}`, { nickname: 'x' }));
      out['mod times out owner'] = await answer(p.mod.call('PATCH', `/servers/${p.server}/members/${p.owner.id}`, { timeout: new Date(Date.now() + 60_000).toISOString() }));
      out['mod kicks owner'] = await answer(p.mod.call('DELETE', `/servers/${p.server}/members/${p.owner.id}`));
      out['mod bans owner'] = await answer(p.mod.call('PUT', `/servers/${p.server}/bans/${p.owner.id}`, { reason: 'probe' }));
      out['mod gives owner a role'] = await answer(p.mod.call('PATCH', `/servers/${p.server}/members/${p.owner.id}`, { roles: [p.modRole] }));
      out['owner (no roles) edits mod nickname'] = await answer(p.owner.call('PATCH', `/servers/${p.server}/members/${p.mod.id}`, { nickname: 'modnick' }));
      out['owner (no roles) times out mod'] = await answer(p.owner.call('PATCH', `/servers/${p.server}/members/${p.mod.id}`, { timeout: new Date(Date.now() + 5_000).toISOString() }));
      out['mod edits peer-ranked mod nickname (own)'] = await answer(p.mod.call('PATCH', `/servers/${p.server}/members/${p.mod.id}`, { nickname: 'self' }));
      out['mod times out plain member'] = await answer(p.mod.call('PATCH', `/servers/${p.server}/members/${p.plain.id}`, { timeout: new Date(Date.now() + 2_000).toISOString() }));
      out['plain edits target nickname'] = await answer(p.plain.call('PATCH', `/servers/${p.server}/members/${p.target.id}`, { nickname: 'nope' }));
    }
    if (section === 'ranks2' || section === 'all') {
      // Roles with no permissions at all, ranked above and below the Moderator, so the answers are about rank.
      const role = async (name: string) => (await p.owner.call<{ id: string }>('POST', `/servers/${p.server}/roles`, { name })).id;
      const [high, low] = [await role('High'), await role('Low')] as [string, string];
      await p.owner.call('PATCH', `/servers/${p.server}/roles/ranks`, { ranks: [high, p.modRole, low] });
      await p.owner.call('PATCH', `/servers/${p.server}/members/${p.plain.id}`, { roles: [high] });
      await p.owner.call('PATCH', `/servers/${p.server}/members/${p.target.id}`, { roles: [low] });
      const soon = () => new Date(Date.now() + 2_000).toISOString();
      const mod = (member: string, body: unknown) => answer(p.mod.call('PATCH', `/servers/${p.server}/members/${member}`, body));
      out['mod renames higher-ranked (High) member'] = await mod(p.plain.id, { nickname: 'higher' });
      out['mod times out higher-ranked member'] = await mod(p.plain.id, { timeout: soon() });
      out['mod kicks higher-ranked member'] = await answer(p.mod.call('DELETE', `/servers/${p.server}/members/${p.plain.id}`));
      out['mod bans higher-ranked member'] = await answer(p.mod.call('PUT', `/servers/${p.server}/bans/${p.plain.id}`, { reason: 'probe' }));
      out['mod renames lower-ranked (Low) member'] = await mod(p.target.id, { nickname: 'lower' });
      out['mod times out lower-ranked member'] = await mod(p.target.id, { timeout: soon() });
      out['mod gives owner the Low role'] = await mod(p.owner.id, { roles: [low] });
      out['mod gives owner the High role'] = await mod(p.owner.id, { roles: [high] });
      out['mod times out owner holding only Low'] = await mod(p.owner.id, { timeout: soon() });
      out['mod removes owner nickname (remove: Nickname)'] = await mod(p.owner.id, { remove: ['Nickname'] });
      out['mod removes higher-ranked member avatar'] = await mod(p.plain.id, { remove: ['Avatar'] });
      out['mod sets nickname on higher-ranked via ManageNicknames only'] = await mod(p.plain.id, { nickname: 'again' });
      out['higher-ranked (High, no perms) times out mod'] = await answer(p.plain.call('PATCH', `/servers/${p.server}/members/${p.mod.id}`, { timeout: soon() }));
    }
    if (section === 'history' || section === 'all') {
      // What Stoat answers when a permission is missing. Channel overrides on @everyone, tried by `plain`.
      const deny = (channel: string, bits: bigint) => p.owner.call('PUT', `/channels/${channel}/permissions/default`, { permissions: { allow: 0, deny: num(bits) } });
      const claims = (token: string) => JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString()) as { video?: Record<string, unknown> };
      const join = async (who: Person, channel: string) => {
        try { return { ok: claims((await who.call<{ token: string }>('POST', `/channels/${channel}/join_call`, { node: 'worldwide' })).token).video }; }
        catch (e) { return { error: e instanceof ApiError ? `${e.status} ${(e.body as { type?: string })?.type}` : String(e) }; }
      };
      await p.owner.call('POST', `/channels/${p.text}/messages`, { content: 'before' });
      out['history: baseline GET messages'] = await answer(p.plain.call('GET', `/channels/${p.text}/messages`));
      await deny(p.text, P.ReadMessageHistory);
      out['history: GET messages without Read message history'] = await answer(p.plain.call('GET', `/channels/${p.text}/messages`));
      out['history: GET messages/search without it'] = await answer(p.plain.call('GET', `/channels/${p.text}/messages/search`));
      out['history: send still allowed'] = await answer(p.plain.call('POST', `/channels/${p.text}/messages`, { content: 'hi' }));
      out['voice: baseline token'] = await join(p.plain, p.voiceA);
      await deny(p.voiceA, P.Connect);
      out['voice: join_call without Connect'] = await join(p.plain, p.voiceA);
      await deny(p.voiceB, P.Speak);
      out['voice: token without Speak'] = await join(p.plain, p.voiceB);
      await deny(p.voiceB, P.Speak | P.Video);
      out['voice: token without Speak and Video'] = await join(p.plain, p.voiceB);
      await deny(p.voiceB, P.Listen);
      out['voice: token without Listen'] = await join(p.plain, p.voiceB);
      await deny(p.voiceB, P.Speak | P.Video | P.Listen);
      out['voice: token without Speak, Video and Listen'] = await join(p.plain, p.voiceB);
    }
    if (section === 'ban' || section === 'all') {
      const posted: string[] = [];
      for (let i = 0; i < 3; i++) posted.push((await p.target.call<{ _id: string }>('POST', `/channels/${p.text}/messages`, { content: `tuuli ${i}` }))._id);
      const keep = (await p.owner.call<{ _id: string }>('POST', `/channels/${p.text}/messages`, { content: 'owner stays' }))._id;
      const count = async () => (await p.owner.call<{ _id: string; author: string }[]>('GET', `/channels/${p.text}/messages?limit=100`)).filter((m) => posted.includes(m._id)).length;
      out['ban: tuuli messages before'] = await count();
      const t0 = performance.now();
      out['ban: mod bans tuuli with 1 hour of deletion'] = await answer(api('PUT', `/servers/${p.server}/bans/${p.target.id}`, { auth: p.mod.auth, body: { reason: 'probe ban', delete_message_seconds: 3600 }, headers: { 'X-Audit-Log-Reason': 'probe ban' } }));
      let left = await count();
      while (left > 0 && performance.now() - t0 < 30_000) { await new Promise((r) => setTimeout(r, 100)); left = await count(); }
      out['ban: tuuli messages left, ms until none'] = { left, ms: Math.round(performance.now() - t0) };
      out['ban: owner message kept'] = (await p.owner.call<{ _id: string }[]>('GET', `/channels/${p.text}/messages?limit=100`)).some((m) => m._id === keep);
      out['ban: unban'] = await answer(p.mod.call('DELETE', `/servers/${p.server}/bans/${p.target.id}`));
    }
    if (section === 'audit' || section === 'all') {
      const reason = (r: string) => ({ 'X-Audit-Log-Reason': r });
      const msg = (await p.target.call<{ _id: string }>('POST', `/channels/${p.text}/messages`, { content: 'to delete' }))._id;
      out['audit: delete other message with reason'] = await answer(api('DELETE', `/channels/${p.text}/messages/${msg}`, { auth: p.mod.auth, headers: reason('spam') }));
      const bulk = [] as string[];
      for (let i = 0; i < 3; i++) bulk.push((await p.target.call<{ _id: string }>('POST', `/channels/${p.text}/messages`, { content: `bulk ${i}` }))._id);
      out['audit: bulk delete 3 with reason'] = await answer(api('DELETE', `/channels/${p.text}/messages/bulk`, { auth: p.mod.auth, body: { ids: bulk }, headers: reason('cleanup') }));
      out['audit: timeout with reason'] = await answer(api('PATCH', `/servers/${p.server}/members/${p.target.id}`, { auth: p.mod.auth, body: { timeout: new Date(Date.now() + 60_000).toISOString() }, headers: reason('cool off') }));
      out['audit: remove timeout'] = await answer(api('PATCH', `/servers/${p.server}/members/${p.target.id}`, { auth: p.mod.auth, body: { timeout: null }, headers: reason('done') }));
      out['audit: server mute+deafen flags'] = await answer(api('PATCH', `/servers/${p.server}/members/${p.target.id}`, { auth: p.mod.auth, body: { can_publish: false, can_receive: false }, headers: reason('loud') }));
      out['audit: nickname'] = await answer(api('PATCH', `/servers/${p.server}/members/${p.target.id}`, { auth: p.mod.auth, body: { nickname: 'Pikku' }, headers: reason('rename') }));
      out['audit: kick with reason'] = await answer(api('DELETE', `/servers/${p.server}/members/${p.plain.id}`, { auth: p.mod.auth, headers: reason('bye') }));
      out['audit: ban with reason'] = await answer(api('PUT', `/servers/${p.server}/bans/${p.target.id}`, { auth: p.mod.auth, body: { reason: 'rule 3' }, headers: reason('rule 3') }));
      out['audit: unban'] = await answer(api('DELETE', `/servers/${p.server}/bans/${p.target.id}`, { auth: p.mod.auth, headers: reason('forgiven') }));
      const log = await p.mod.call<{ audit_logs: Record<string, unknown>[] }>('GET', `/servers/${p.server}/audit_logs?limit=100`);
      out['audit: top-level keys of an entry'] = Object.keys(log.audit_logs[0]!);
      out['audit: newest entries (actor, target, reason, action)'] = log.audit_logs.slice(0, 9).map((e) => ({ user: e.user, target: e.target, reason: e.reason, action: e.action }));
      out['audit: filter by type=BanCreate'] = (await p.mod.call<{ audit_logs: unknown[] }>('GET', `/servers/${p.server}/audit_logs?type=BanCreate`)).audit_logs.length;
      out['audit: limit=2 and before'] = (await p.mod.call<{ audit_logs: { _id: string }[] }>('GET', `/servers/${p.server}/audit_logs?limit=2`)).audit_logs.length;
      out['audit: plain member reads log'] = await answer(p.target.call('GET', `/servers/${p.server}/audit_logs`));
    }
    console.log(JSON.stringify(out, null, 2));
  } finally {
    await cleanup(p);
  }
}
