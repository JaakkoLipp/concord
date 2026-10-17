/**
 * The account runner and the admin view's account actions on the local stack (architecture section 11.5):
 * - the user list reaches an admin and nobody else, with no emails, and shows roles,
 * - moderator add and remove change Stoat's server-creator list; admin add and remove change ADMIN_USER_IDS and
 *   restart the layer, after which the person's gates show it,
 * - a password link resets the password, which the new one then logs in with,
 * - suspend signs the person out and blocks their login, unsuspend lets them back,
 * - the rules hold: nobody removes or suspends the owner or themself, and a non-owner admin can't reset another
 *   admin's password,
 * - the runner doesn't trust the layer: a request written straight into the spool by a non-admin, a request with a
 *   made-up action, and a symlink in place of a request are all refused, and nothing outside the folder is read.
 * Runs on a throwaway account made for the check, and leaves roles as they were.
 * `node tools/live/src/accounts.ts`
 */
import { readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { loadState } from '../../seed/src/config.ts';
import { api } from '../../seed/src/http.ts';
import { login, makeAccount, passwordFor } from '../../seed/src/seed.ts';
import { APP } from './browser.ts';
import { person, until } from './people.ts';

const st = loadState()!;
const origin = new URL(APP).origin;
const layerApi = `${origin}/app/api/v1`;
const spool = join(homedir(), 'stoat', 'concord', 'spool');
let failed = 0;
function check(ok: boolean, what: string, detail = ''): void {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ` -> ${detail}` : ''}`);
}

const [owner, dev] = await Promise.all(['dev-admin', 'dev'].map(person));
const handle = `acct${Date.now().toString(36)}`;
const target = await makeAccount(handle, handle, st.emailDomain);
const targetId = target.user._id;
const targetSession = (target.auth as { session: string }).session;
const email = `${handle}@${st.emailDomain}`;

/** A layer call, waiting out the per-address 429 and the gap while concord-web restarts. */
async function layer(token: string, method: string, path: string, body?: unknown): Promise<Response> {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const r = await fetch(`${layerApi}${path}`, {
        method, headers: { 'x-session-token': token, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      if (r.status !== 429 && r.status !== 502 && r.status !== 503) return r;
      if (r.status === 429) {
        const wait = (await r.clone().json()) as { retry_after?: number; limit?: string };
        if (wait.limit !== 'address') return r;
        await new Promise((done) => setTimeout(done, (wait.retry_after ?? 1_000) + 500));
      } else if (path.startsWith('/admin/users')) return r;
      else await new Promise((done) => setTimeout(done, 1_000));
    } catch {
      await new Promise((done) => setTimeout(done, 1_000));
    }
  }
  throw new Error(`${path}: no answer`);
}
interface Answer { status: string; message?: string; link?: string }
/** Ask for an action and wait for the runner's answer. */
async function ask(token: string, action: string, user: string): Promise<Answer> {
  const sent = await layer(token, 'POST', '/admin/actions', { action, user });
  if (!sent.ok) return { status: `refused ${sent.status}`, message: await sent.text() };
  const { id } = (await sent.json()) as { id: string };
  for (let i = 0; i < 90; i++) {
    const r = await layer(token, 'GET', `/admin/actions/${id}`).catch(() => null);
    if (r?.ok) {
      const answer = (await r.json()) as Answer;
      if (answer.status !== 'pending') return answer;
    }
    await new Promise((done) => setTimeout(done, 1_000));
  }
  return { status: 'timeout' };
}
const creators = async () => ((await (await fetch(`${origin}/api/`)).json()) as { features: { limits: { global: { restrict_server_creation: string[] } } } }).features.limits.global.restrict_server_creation;
const gates = async (token: string) => ((await (await layer(token, 'GET', '/me')).json()) as { gates: { admin: boolean; serverCreator: boolean } }).gates;
const stoatLogin = (pw: string) => login(email, pw).then(() => 'ok', (e: Error) => e.message);

try {
  // 1. The list.
  const listed = await layer(owner!.token, 'GET', '/admin/users');
  const list = (await listed.json()) as { users: { id: string; username: string; admin: boolean; moderator: boolean; owner: boolean; email?: string }[] };
  const row = (id: string) => list.users.find((u) => u.id === id);
  check(listed.ok && !!row(owner!.id)?.owner && !!row(owner!.id)?.admin, 'the owner sees the platform list, marked as owner and admin');
  check(!JSON.stringify(list).includes('@'), 'the list carries no emails');
  check((await layer(dev!.token, 'GET', '/admin/users')).status === 404, 'a plain member gets 404 for it');
  check((await layer(dev!.token, 'POST', '/admin/actions', { action: 'suspend', user: targetId })).status === 404, 'and for an action');

  // 2. Moderator.
  const before = await creators();
  const made = await ask(owner!.token, 'moderator:add', targetId);
  check(made.status === 'ok' && (await creators()).includes(targetId), 'moderator:add puts them on the server-creator list', `${made.status} ${made.message}`);
  check((await gates(targetSession)).serverCreator === true, 'and their gates show Moderator');
  const dup = await ask(owner!.token, 'moderator:add', targetId);
  check(dup.status === 'failed', 'adding again is refused', dup.message ?? '');
  const unmade = await ask(owner!.token, 'moderator:remove', targetId);
  check(unmade.status === 'ok' && JSON.stringify(await creators()) === JSON.stringify(before), 'moderator:remove restores the list exactly', `${unmade.status}`);

  // 3. Admin: the layer restarts, then the gate shows.
  const promoted = await ask(owner!.token, 'admin:add', targetId);
  check(promoted.status === 'ok', 'admin:add is done', `${promoted.status} ${promoted.message}`);
  check(await until(async () => (await gates(targetSession)).admin === true, 60_000).then(() => true, () => false), 'after the layer restarts, their gates show Admin');
  const listAfter = (await (await layer(owner!.token, 'GET', '/admin/users')).json()) as { users: { id: string; admin: boolean }[] };
  check(listAfter.users.find((u) => u.id === targetId)?.admin === true, 'the list shows them as admin');

  // 4. The rules, from the new admin's side and the owner's.
  const asNew = targetSession;
  const cases: [string, string, string, string][] = [
    [asNew, 'admin:remove', owner!.id, 'a non-owner admin can’t remove the owner'],
    [asNew, 'suspend', owner!.id, 'nor suspend them'],
    [asNew, 'password-link', owner!.id, 'nor reset their password'],
    [asNew, 'admin:remove', targetId, 'nobody removes themself as admin'],
    [asNew, 'suspend', targetId, 'nor suspends themself'],
    [owner!.token, 'admin:remove', owner!.id, 'the owner can’t remove themself either'],
    [owner!.token, 'suspend', targetId, 'an admin must lose the role before being suspended'],
  ];
  for (const [token, action, user, what] of cases) {
    const r = await ask(token, action, user);
    check(r.status === 'failed', what, r.message ?? r.status);
  }
  const demoted = await ask(owner!.token, 'admin:remove', targetId);
  check(demoted.status === 'ok', 'the owner removes the new admin again', `${demoted.status} ${demoted.message}`);
  check(await until(async () => (await gates(targetSession)).admin === false, 60_000).then(() => true, () => false), 'and their gates show it');

  // 5. Password link, then suspend and unsuspend.
  const link = await ask(owner!.token, 'password-link', targetId);
  const token = /\/app\/welcome\/([A-Za-z0-9_-]{32})$/.exec(link.link ?? '')?.[1];
  check(link.status === 'ok' && !!token, 'password-link answers with a welcome link, once', link.link ?? link.status);
  const fresh = `${passwordFor(handle)}-new`;
  if (token) await api('PATCH', '/auth/account/reset_password', { body: { token, password: fresh } });
  check((await stoatLogin(fresh)) === 'ok', 'the new password logs in after using the link');
  const gone = await ask(owner!.token, 'suspend', targetId);
  check(gone.status === 'ok', 'suspend is done', gone.message ?? '');
  const blocked = await stoatLogin(fresh);
  check(blocked !== 'ok', 'a suspended account can’t log in', blocked.slice(0, 80));
  const oldSession = await fetch(`${origin}/api/users/@me`, { headers: { 'x-session-token': targetSession } });
  check(oldSession.status === 401, 'and its old session is gone', `${oldSession.status}`);
  check((await ask(owner!.token, 'moderator:add', targetId)).status === 'failed', 'a suspended person can’t be made moderator');
  const back = await ask(owner!.token, 'unsuspend', targetId);
  check(back.status === 'ok' && (await stoatLogin(fresh)) === 'ok', 'unsuspend lets them log in again', back.message ?? '');

  // 6. The runner doesn't trust the layer: requests written straight into the spool.
  const drop = (name: string, body: unknown) => writeFileSync(join(spool, 'in', name), typeof body === 'string' ? body : JSON.stringify(body), { mode: 0o600 });
  // Read from the runner's own folder: the layer rightly shows an answer only to the admin who asked.
  const result = async (id: string): Promise<Answer> => {
    for (let i = 0; i < 20; i++) {
      try {
        return JSON.parse(readFileSync(join(spool, 'out', `${id}.res.json`), 'utf8')) as Answer;
      } catch {
        await new Promise((done) => setTimeout(done, 500));
      }
    }
    return { status: 'timeout' };
  };
  const byPlain = randomUUID();
  drop(`${byPlain}.req.json`, { action: 'suspend', user: targetId, by: dev!.id });
  const a1 = await result(byPlain);
  check(a1.status === 'failed' && /admin/i.test(a1.message ?? ''), 'a request by a non-admin is refused by the runner itself', a1.message ?? a1.status);
  const madeUp = randomUUID();
  drop(`${madeUp}.req.json`, { action: 'rm -rf /', user: targetId, by: owner!.id });
  const a2 = await result(madeUp);
  check(a2.status === 'failed' && /not valid/i.test(a2.message ?? ''), 'a made-up action is refused as not valid', a2.message ?? a2.status);
  const sneaky = randomUUID();
  symlinkSync('/etc/passwd', join(spool, 'in', `${sneaky}.req.json`));
  const a3 = await result(sneaky);
  check(a3.status === 'failed' && /not valid/i.test(a3.message ?? ''), 'a symlink in place of a request is refused, not followed', a3.message ?? a3.status);
  check(!readdirSync(join(spool, 'in')).some((n) => n.startsWith(sneaky) || n.startsWith(madeUp) || n.startsWith(byPlain)), 'and the runner clears them out of the folder');
  const junk = readdirSync(join(spool, 'in')).length;
  writeFileSync(join(spool, 'in', 'notes.txt'), 'hello');
  await until(async () => readdirSync(join(spool, 'in')).length === junk, 10_000).catch(() => {});
  check(readdirSync(join(spool, 'in')).length === junk, 'a stray file in the folder is deleted');
} catch (e) {
  failed++;
  console.log(`FAIL ${String(e).split('\n')[0]}`);
} finally {
  // As found: not a moderator, not an admin, not suspended.
  for (const action of ['unsuspend', 'moderator:remove', 'admin:remove']) await ask(owner!.token, action, targetId).catch(() => {});
}
console.log(failed ? `accounts: ${failed} failed` : 'accounts: all passed');
process.exit(failed ? 1 : 0);
