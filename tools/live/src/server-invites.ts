/**
 * Server invites on request, on the local stack's seeded server:
 * - `dev` (a member) asks and the request waits without a code, `dev-admin` approves it with the code of an invite
 *   it made, and `dev` then sees the code; a second review is refused,
 * - `dev-admin` (a moderator) skips review with a code of its own, and `dev` can't attach a code,
 * - in the client, `dev` asks under Invite to beta, `dev-admin` approves it in Administration (the client makes the
 *   Stoat invite), and `dev` copies the link, which Stoat knows as an invite to the seeded server.
 * Every invite made here is revoked afterwards. Each run spends 2 of dev's 10 requests a day.
 * `node tools/live/src/server-invites.ts [screenshot-dir]`
 */
import { join } from 'node:path';
import { loadState } from '../../seed/src/config.ts';
import { APP, launch, watch } from './browser.ts';
import { signIn } from './login.ts';
import { person } from './people.ts';

const st = loadState()!;
const out = process.argv[2];
const server = st.serverId;
const channel = st.channels.offtopic!;
const api = `${new URL(APP).origin}/app/api/v1`;
const note = `check ${Date.now().toString(36)}`;
let failed = 0;
function check(ok: boolean, what: string, detail = ''): void {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ` -> ${detail}` : ''}`);
}
const shows = (p: Promise<unknown>) => p.then(() => true, () => false);

const [admin, dev] = await Promise.all(['dev-admin', 'dev'].map(person));
async function layer(token: string, method: string, path: string, body?: unknown): Promise<Response> {
  const send = () => fetch(`${api}${path}`, {
    method, headers: { 'x-session-token': token, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const r = await send();
  if (r.status !== 429) return r;
  const wait = (await r.clone().json()) as { retry_after?: number; limit?: string };
  if (wait.limit !== 'address') return r;
  await new Promise((done) => setTimeout(done, (wait.retry_after ?? 1_000) + 500));
  return send();
}
interface Request { id: string; status: string; code: string | null; note: string }
const list = async (token: string, review = false) => (await (await layer(token, 'GET', `/server-invites?review=${review}`)).json() as { invites: Request[] }).invites;
const made: string[] = [];
const makeCode = async (): Promise<string> => {
  const invite = await admin!.call<{ _id: string }>('POST', `/channels/${channel}/invites`);
  made.push(invite._id);
  return invite._id;
};

const browser = await launch();
async function open(handle: string, path: string) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  const problems = watch(page);
  await signIn(page, handle);
  await page.goto(`${APP}${path}`, { waitUntil: 'networkidle' });
  return { page, problems };
}

try {
  // 1. A member asks; an admin approves with a code of their own.
  const asked = await (await layer(dev!.token, 'POST', '/server-invites', { server, note: `api ${note}` })).json() as Request;
  check(asked.status === 'pending' && asked.code === null, 'a member’s request waits, with no code', `${asked.status}`);
  const code = await makeCode();
  const approved = await layer(admin!.token, 'POST', `/server-invites/${asked.id}`, { action: 'approve', code });
  check(approved.ok, 'the admin approves it with an invite they made');
  const mine = (await list(dev!.token)).find((r) => r.id === asked.id);
  check(mine?.status === 'approved' && mine.code === code, 'the member then sees the code', `${mine?.status}`);
  const again = await layer(admin!.token, 'POST', `/server-invites/${asked.id}`, { action: 'approve', code });
  check(again.status === 409, 'a second review is refused', `${again.status}`);
  const plain = await layer(dev!.token, 'POST', `/server-invites/${asked.id}`, { action: 'decline' });
  check(plain.status === 404, 'a member can’t review', `${plain.status}`);

  // 2. A moderator skips review; a member can't attach a code.
  const direct = await (await layer(admin!.token, 'POST', '/server-invites', { server, note: '', code: await makeCode() })).json() as Request;
  check(direct.status === 'approved' && !!direct.code, 'a moderator’s own invite is approved at once', `${direct.status}`);
  const sneaky = await layer(dev!.token, 'POST', '/server-invites', { server, note: '', code: 'AbC12345' });
  check(sneaky.status === 403, 'a member can’t attach a code to skip review', `${sneaky.status}`);

  // 3. The client: dev asks, dev-admin approves in Administration, dev copies the link.
  const d = await open('dev', '/channels/@me/invitations');
  await d.page.locator('select').selectOption(server);
  await d.page.getByLabel('Who is it for?').fill(`ui ${note}`);
  await d.page.getByRole('button', { name: 'Ask for invite' }).click();
  check(await shows(d.page.getByText(/Request sent/).first().waitFor({ timeout: 8_000 })), 'in the client, a member asks for a server invite');
  const waiting = d.page.locator('li', { hasText: `ui ${note}` });
  check(await shows(waiting.getByText('Awaiting review').waitFor({ timeout: 8_000 })) && (await waiting.getByRole('button', { name: 'Copy invite link' }).count()) === 0, 'it waits, with no link');

  const a = await open('dev-admin', '/channels/@me/administration');
  await a.page.getByRole('tab', { name: 'Requests' }).click();
  const queued = a.page.locator('li', { hasText: `ui ${note}` });
  check(await shows(queued.waitFor({ timeout: 8_000 })), 'the admin sees it under Administration');
  if (out) await a.page.screenshot({ path: join(out, 'server-invites-administration.png') });
  await queued.getByRole('button', { name: 'Approve' }).click();
  check(await shows(queued.waitFor({ state: 'detached', timeout: 10_000 })), 'approving it takes it off the queue');

  await d.page.reload({ waitUntil: 'networkidle' });
  await d.page.locator('li', { hasText: `ui ${note}` }).getByRole('button', { name: 'Copy invite link' }).click();
  const link = await d.page.evaluate(() => navigator.clipboard.readText());
  const uiCode = /\/app\/invite\/([A-Za-z0-9]+)$/.exec(link)?.[1] ?? '';
  check(!!uiCode, 'the member copies an invite link', link);
  if (uiCode) {
    made.push(uiCode);
    const preview = await fetch(`${new URL(APP).origin}/api/invites/${uiCode}`);
    check(preview.ok && (await preview.json() as { server_id?: string }).server_id === server, 'Stoat knows it as an invite to the seeded server', `${preview.status}`);
  }
  if (out) await d.page.screenshot({ path: join(out, 'server-invites.png') });
  check([a, d].every((x) => x.problems.failed.length === 0), 'no failed requests', [a, d].flatMap((x) => x.problems.failed).join(', '));
} catch (e) {
  failed++;
  console.log(`FAIL ${String(e).split('\n')[0]}`);
} finally {
  for (const c of made) await admin!.call('DELETE', `/invites/${c}`).catch(() => {});
  await browser.close();
}
console.log(failed ? `server-invites: ${failed} failed` : 'server-invites: all passed');
process.exit(failed ? 1 : 0);
