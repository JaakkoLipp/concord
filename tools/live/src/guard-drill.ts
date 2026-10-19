/**
 * m4.7-plan.md task 12's drill, on the local dev stack (vps-runbook.md section 9): the history guard against a real Stoat.
 *   node tools/live/src/guard-drill.ts setup   a throwaway server owned by dev-admin, a bot invited to it with a role
 *                                              ranked on top (View audit logs, Assign roles, Kick members), and a
 *                                              "Drill mods" role with Manage messages for `guardmod`. Prints the lines
 *                                              for ~/stoat/concord/host.env; then `pnpm deploy:stack` starts the guard.
 *   node tools/live/src/guard-drill.ts run     `dev` posts 30 messages, guardmod deletes 26 of them one by one. The guard
 *                                              must take guardmod's roles and DM the owner; the owner's DM
 *                                              `restore <ID>` must give them back.
 * Needs the throwaway account: pnpm seed account guardmod
 * Afterwards, switch the guard off: remove the two lines from host.env and run `concord/dc up -d --remove-orphans` in
 * ~/stoat, then delete the throwaway server and the bot (dev-admin's Settings, My Bots).
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { person, until } from './people.ts';

const P = { KickMembers: 1n << 6n, AssignRoles: 1n << 9n, ManageMessages: 1n << 23n, ViewAuditLogs: 1n << 40n };
const failures: string[] = [];
const check = (ok: boolean, what: string, actual?: unknown) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${actual === undefined ? '' : ` -> ${JSON.stringify(actual)}`}`);
  if (!ok) failures.push(what);
};

const owner = await person('dev-admin');
const mod = await person('guardmod');
const poster = await person('dev');
const role = async (server: string, name: string, allow: bigint) => {
  const { id } = await owner.call<{ id: string }>('POST', `/servers/${server}/roles`, { name });
  await owner.call('PUT', `/servers/${server}/permissions/${id}`, { permissions: { allow: Number(allow), deny: 0 } });
  return id;
};

if (process.argv[2] === 'setup') {
  const made = await owner.call<{ server: { _id: string }; channels: { _id: string }[] }>('POST', '/servers/create', { name: `m47-guard ${Date.now() % 100000}` });
  const server = made.server._id;
  const invite = await owner.call<{ _id: string }>('POST', `/channels/${made.channels[0]!._id}/invites`);
  await mod.call('POST', `/invites/${invite._id}`);
  await poster.call('POST', `/invites/${invite._id}`);
  const bot = await owner.call<{ _id: string; token: string }>('POST', '/bots/create', { name: `guard_${Date.now() % 100000}` });
  await owner.call('POST', `/bots/${bot._id}/invite`, { server });
  const guardRole = await role(server, 'Guard', P.ViewAuditLogs | P.AssignRoles | P.KickMembers);
  const modRole = await role(server, 'Drill mods', P.ManageMessages);
  // The guard's role first: the top one after the owner's.
  await owner.call('PATCH', `/servers/${server}/roles/ranks`, { ranks: [guardRole, modRole] });
  await owner.call('PATCH', `/servers/${server}/members/${bot._id}`, { roles: [guardRole] });
  await owner.call('PATCH', `/servers/${server}/members/${mod.id}`, { roles: [modRole] });
  console.log(`# for ~/stoat/concord/host.env, then pnpm deploy:stack\nGUARD_BOT_TOKEN=${bot.token}\nGUARD_SERVER=${server}`);
  process.exit(0);
}

const env = readFileSync(join(homedir(), 'stoat', 'concord', 'host.env'), 'utf8');
const server = /^GUARD_SERVER=(\S+)/m.exec(env)?.[1];
const token = /^GUARD_BOT_TOKEN=(\S+)/m.exec(env)?.[1];
if (!server || !token) throw new Error('host.env has no GUARD_SERVER or GUARD_BOT_TOKEN: run setup first');
const s = await owner.call<{ channels: string[]; roles: Record<string, { name: string }> }>('GET', `/servers/${server}`);
const modRole = Object.entries(s.roles).find(([, r]) => r.name === 'Drill mods')![0];
const channel = s.channels[0]!;
const roles = async () => (await owner.call<{ roles?: string[] }>('GET', `/servers/${server}/members/${mod.id}`)).roles ?? [];
// A run after a strip that wasn't undone: start with the role.
if (!(await roles()).includes(modRole)) await owner.call('PATCH', `/servers/${server}/members/${mod.id}`, { roles: [modRole] });

// The owner's DM with the guard, and what was in it before.
const botId = (await fetch(`${process.env.CONCORD_BACKEND ?? 'http://localhost'}/api/users/@me`, { headers: { 'x-bot-token': token } }).then((r) => r.json()) as { _id: string })._id;
const dm = (await owner.call<{ _id: string }>('GET', `/users/${botId}/dm`))._id;
const newest = async () => (await owner.call<{ _id: string; author: string; content?: string }[]>('GET', `/channels/${dm}/messages?limit=5`));
const before = (await newest())[0]?._id ?? '';
const fromGuard = async (match: RegExp) => (await newest()).find((m) => m._id > before && m.author === botId && match.test(m.content ?? ''));

const ids: string[] = [];
for (let i = 0; i < 30; i++) ids.push((await poster.call<{ _id: string }>('POST', `/channels/${channel}/messages`, { content: `guard drill ${i}` }))._id);
const started = performance.now();
let deleted = 0;
for (const id of ids.slice(0, 26)) {
  try {
    await mod.call('DELETE', `/channels/${channel}/messages/${id}`);
    deleted++;
  } catch (e) {
    console.log(`deletion ${deleted + 1} refused: ${String(e).slice(0, 120)}`);
    break;
  }
}
console.log(`guardmod deleted ${deleted} in ${Math.round(performance.now() - started)} ms`);
const stripMs = await until(async () => !(await roles()).includes(modRole), 90_000).catch(() => -1);
check(stripMs >= 0, 'the guard takes the moderator’s roles', { ms: stripMs, roles: await roles() });
check(deleted >= 26 || stripMs >= 0, 'at most 26 deletions got through', deleted);
const alert = await until(async () => !!(await fromGuard(/Guard/)), 30_000).then(() => fromGuard(/Guard/)).catch(() => undefined);
check(!!alert && alert.content!.includes(mod.id), 'the owner gets a DM naming who', alert?.content);

if (stripMs < 0) {
  console.error('\nthe guard took nothing, so the restore is not tried');
  process.exit(1);
}
await owner.call('POST', `/channels/${dm}/messages`, { content: `restore ${mod.id}` });
const back = await until(async () => (await roles()).includes(modRole), 30_000).catch(() => -1);
check(back >= 0, '`restore <ID>` from the owner’s DM gives the roles back', await roles());
const reply = await until(async () => !!(await fromGuard(/back/)), 15_000).then(() => fromGuard(/back/)).catch(() => undefined);
check(!!reply, 'the guard answers the restore', reply?.content);

if (failures.length) {
  console.error(`\n${failures.length} failed`);
  process.exit(1);
}
console.log('\nall passed');
