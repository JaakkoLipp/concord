/**
 * Closed-beta invitations on the local stack: the whole way a new member gets in.
 * - an unauthenticated call is refused; `dev` requesting one is pending until `dev-admin` approves it,
 * - a moderator's (dev-admin) own invitation is approved at once, a week out, and the link rotates,
 * - redeem refuses a wrong email and a short password, creates the account once, and burns the link,
 * - reviewing a row that already moved on is refused,
 * - in the client, `dev` (a plain member) asks under Invite to beta and waits, dev-admin approves it in
 *   Administration, `dev` copies the link, and the link opens signed out and creates the account.
 * Each run spends 2 of dev's 10 invitation requests a day. The throwaway addresses and their accounts stay on
 * the local stack; nothing is touched beyond that.
 * `node tools/live/src/beta.ts [screenshot-dir]`
 */
import { join } from 'node:path';
import { loadState } from '../../seed/src/config.ts';
import { APP, launch, watch } from './browser.ts';
import { signIn } from './login.ts';
import { person } from './people.ts';

const st = loadState()!;
const out = process.argv[2];
const api = `${new URL(APP).origin}/app/api/v1`;
const at = `beta-${Date.now().toString(36)}`;
const address = (name: string) => `${at}-${name}@${st.emailDomain}`;
const password = `beta-${at}!Aa9`;
let failed = 0;
function check(ok: boolean, what: string, detail = ''): void {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ` -> ${detail}` : ''}`);
}
const shows = (p: Promise<unknown>) => p.then(() => true, () => false);

const [admin, dev] = await Promise.all(['dev-admin', 'dev'].map(person));
/** A layer call, waiting out the per-address 429 as told (all local requests share Docker's address). */
async function layer(token: string | null, method: string, path: string, body?: unknown): Promise<Response> {
  const send = () => fetch(`${api}${path}`, {
    method, headers: { ...(token ? { 'x-session-token': token } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const r = await send();
  if (r.status !== 429) return r;
  const wait = (await r.clone().json()) as { retry_after?: number; limit?: string };
  if (wait.limit !== 'address') return r;
  await new Promise((done) => setTimeout(done, (wait.retry_after ?? 1_000) + 500));
  return send();
}
const json = async <T>(r: Response) => (await r.json()) as T;

interface Invitation { id: string; email: string; status: string; expiresAt: number | null }
const mint = async (token: string, id: string): Promise<string> =>
  (await json<{ token: string }>(await layer(token, 'POST', `/beta/invitations/${id}`, { action: 'link' }))).token;

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
  // 1. Signed out and non-admins.
  const anonymous = await layer(null, 'GET', '/beta/invitations');
  check(anonymous.status === 401, 'signed out, the invitations endpoint is 401', `${anonymous.status}`);
  const refused = await layer(dev!.token, 'GET', '/beta/invitations?review=true');
  check(refused.status === 404, 'a plain member can’t list the review queue', `${refused.status}`);

  // 2. dev asks, dev-admin reviews; dev-admin’s own is approved at once.
  const asked = await json<Invitation>(await layer(dev!.token, 'POST', '/beta/invitations', { email: address('member') }));
  check(asked.status === 'pending' && asked.expiresAt === null, 'a member’s request is pending with no expiry', `${asked.status}`);
  const queue = await json<{ invitations: Invitation[] }>(await layer(admin!.token, 'GET', '/beta/invitations?review=true'));
  check(queue.invitations.some((i) => i.id === asked.id), 'an admin sees it in the review queue');
  const approved = await layer(admin!.token, 'POST', `/beta/invitations/${asked.id}`, { action: 'approve' });
  check(approved.ok, 'the admin approves it');
  const again = await layer(admin!.token, 'POST', `/beta/invitations/${asked.id}`, { action: 'approve' });
  check(again.status === 409, 'approving it twice is refused', `${again.status}`);

  const direct = await json<Invitation>(await layer(admin!.token, 'POST', '/beta/invitations', { email: address('direct') }));
  const week = Math.abs((direct.expiresAt ?? 0) - (Date.now() + 7 * 24 * 60 * 60_000));
  check(direct.status === 'approved' && week < 60_000, 'a moderator’s invitation is approved for a week', `${direct.status} ${week}ms`);

  // 3. The link rotates; the old one stops working.
  const first = await mint(admin!.token, direct.id);
  const second = await mint(admin!.token, direct.id);
  check(first !== second && /^[A-Za-z0-9_-]{43}$/.test(second), 'links are 43 characters and rotate');
  const stale = await layer(null, 'POST', '/beta/redeem', { token: first, email: direct.email, password });
  check(stale.status === 400, 'the rotated-away link is refused', `${stale.status}`);

  // 4. Redeem: wrong address, weak password, then the account.
  const wrongAddress = await layer(null, 'POST', '/beta/redeem', { token: second, email: address('someone-else'), password });
  check(wrongAddress.status === 400, 'redeeming for another address is refused', `${wrongAddress.status}`);
  const weak = await layer(null, 'POST', '/beta/redeem', { token: second, email: direct.email, password: 'short' });
  check(weak.status === 400 && (await json<{ type: string }>(weak)).type === 'ShortPassword', 'a short password is refused by Stoat’s rules', `${weak.status}`);
  const redeemed = await layer(null, 'POST', '/beta/redeem', { token: second, email: direct.email, password });
  check(redeemed.ok, 'the account is created through the invitation', `${redeemed.status} ${await redeemed.clone().text()}`);
  const reused = await layer(null, 'POST', '/beta/redeem', { token: second, email: direct.email, password });
  check(reused.status === 400, 'the used link is refused', `${reused.status}`);
  const owner = await json<{ invitations: Invitation[] }>(await layer(admin!.token, 'GET', '/beta/invitations?review=true'));
  check(owner.invitations.find((i) => i.id === direct.id)?.status === 'used', 'the invitation reads used', owner.invitations.find((i) => i.id === direct.id)?.status ?? '');

  // 5. The client. dev, a plain member, asks for an invitation and waits; dev-admin approves it under Administration.
  const d = await open('dev', '/channels/@me');
  const inviteRow = d.page.getByRole('link', { name: 'Invite to beta' });
  check(await shows(inviteRow.waitFor({ timeout: 10_000 })), 'a plain member sees Invite to beta under Mentions');
  check((await d.page.getByRole('link', { name: 'Administration' }).count()) === 0, 'and no Administration row');
  await inviteRow.click();
  check(await shows(d.page.getByRole('heading', { name: 'Invite to the beta' }).waitFor({ timeout: 8_000 })), 'it opens the invite view in place of the DMs');
  const uiAddress = address('from-ui');
  await d.page.getByLabel('Email address').fill(uiAddress);
  await d.page.getByRole('button', { name: 'Create invitation' }).click();
  check(await shows(d.page.getByText(/Request sent/).waitFor({ timeout: 8_000 })), 'the member’s request is sent for approval');
  const memberRow = d.page.locator('li', { hasText: uiAddress });
  check(await shows(memberRow.getByText('Awaiting review').waitFor({ timeout: 8_000 })) && (await memberRow.getByRole('button', { name: 'Copy link' }).count()) === 0, 'it waits, with no link yet');

  const a = await open('dev-admin', '/channels/@me');
  check((await a.page.getByRole('link', { name: 'Invite to beta' }).count()) === 1, 'dev-admin sees Invite to beta too');
  await a.page.getByRole('link', { name: 'Administration' }).click();
  check(await shows(a.page.getByRole('heading', { name: 'Administration' }).waitFor({ timeout: 8_000 })), 'dev-admin opens Administration');
  const queued = a.page.locator('li', { hasText: uiAddress });
  await queued.getByRole('button', { name: 'Approve' }).click();
  check(await shows(queued.getByText('Approved').waitFor({ timeout: 8_000 })), 'the admin approves the request');
  if (out) await a.page.screenshot({ path: join(out, 'beta-administration.png') });

  await d.page.reload({ waitUntil: 'networkidle' });
  const approvedRow = d.page.locator('li', { hasText: uiAddress });
  await approvedRow.getByRole('button', { name: 'Copy link' }).click();
  check(await shows(d.page.getByText('Invitation link copied.').waitFor({ timeout: 8_000 })), 'the member can now copy the link');
  const link = await d.page.evaluate(() => navigator.clipboard.readText());
  check(/\/app\/beta\/[A-Za-z0-9_-]{43}$/.test(link), 'the clipboard holds the invite link', link);
  if (out) await d.page.screenshot({ path: join(out, 'beta-invitations.png') });
  await d.page.context().close();
  await a.page.context().close();

  // 6. The link opens signed out and creates the account through the page.
  const anonContext = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const anon = await anonContext.newPage();
  const anonProblems = watch(anon);
  await anon.goto(link, { waitUntil: 'networkidle' });
  check(anon.url().includes('/app/beta/'), 'the link stays on the beta page signed out', anon.url());
  check(await shows(anon.getByRole('heading', { name: 'Join the Concord beta' }).waitFor({ timeout: 8_000 })), 'the redeem form shows');
  await anon.getByLabel('Email address').fill(uiAddress);
  await anon.locator('input[type=password]').nth(0).fill(password);
  await anon.locator('input[type=password]').nth(1).fill(password);
  await anon.getByRole('button', { name: 'Create account' }).click();
  const created = await shows(anon.getByText('Your account is ready').waitFor({ timeout: 10_000 }));
  check(created, 'the page creates the account', created ? '' : await anon.getByRole('alert').innerText().catch(() => 'no alert'));
  if (out) await anon.screenshot({ path: join(out, 'beta-redeem.png') });
  await anon.getByRole('button', { name: 'Log in' }).click();
  check(await shows(anon.waitForURL(/\/app\/login/, { timeout: 8_000 })), 'and sends them on to log in');
  await anonContext.close();

  // The browser part asks for no 4xx beyond the ones the app expects to handle (none here).
  const trouble = [a.problems, d.problems, anonProblems];
  check(trouble.every((p) => p.failed.length === 0), 'no failed requests', trouble.flatMap((p) => p.failed).join(', '));
  check(trouble.every((p) => p.console.length === 0), 'no console errors', trouble.flatMap((p) => p.console).slice(0, 3).join(' | '));
} catch (e) {
  failed++;
  console.log(`FAIL ${String(e).split('\n')[0]}`);
} finally {
  await browser.close();
}
console.log(failed ? `beta: ${failed} failed` : 'beta: all passed');
process.exit(failed ? 1 : 0);
