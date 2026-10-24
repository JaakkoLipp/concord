/**
 * Concord's own layer on the live stack (m4.4-plan.md task 3):
 * - /health, and /me without a session, with a bad one, and for dev-admin and dev with their gates,
 * - /check/{server}: dev-admin, the owner, holds Manage server in the seeded server and dev doesn't,
 * - the gates in the settings sidebar for dev-admin, and none for dev,
 * - dev-admin moving through server settings in the client, a section every 4 s, which spends their Stoat bucket
 *   of 5 per 10 s for the server, while the layer checks their permission there every 3.5 s: no 429 reaches the
 *   client. A client clicking as fast as it can gets 429s from Stoat with or without the layer (m4.4-results.md).
 * - a flood of random tokens hits the per-address limit, not Stoat. Run last: it locks this address out of new
 *   sign-ins to the layer for a minute.
 * `node tools/live/src/layer.ts`. LAYER_CHECK_MS=0 runs the client's part without the layer's checks, as a control.
 */
import { loadState } from '../../seed/src/config.ts';
import { APP, launch, watch } from './browser.ts';
import { signIn } from './login.ts';
import { person } from './people.ts';

const state = loadState();
if (!state) throw new Error('no seed state');
const server = state.serverId;
const api = `${new URL(APP).origin}/app/api/v1`;
let failed = 0;
function check(ok: boolean, what: string, detail = ''): void {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ` -> ${detail}` : ''}`);
}
async function call(path: string, token?: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = await fetch(`${api}${path}`, { headers: token ? { 'x-session-token': token } : {} });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as Record<string, unknown> };
}

const health = await call('/health');
check(health.status === 200 && health.body.stoat === 'up', '/health', `${health.status} ${JSON.stringify(health.body)}`);
const none = await call('/me');
check(none.status === 401 && none.body.type === 'InvalidSession', '/me without a session', `${none.status} ${none.body.type}`);
const bad = await call('/me', 'not-a-real-session-token');
check(bad.status === 401 && bad.body.type === 'InvalidSession', '/me with a bad session', `${bad.status} ${bad.body.type}`);

const [admin, dev] = await Promise.all(['dev-admin', 'dev'].map(person));
const adminMe = await call('/me', admin!.token);
check(adminMe.status === 200 && adminMe.body.id === admin!.id && JSON.stringify(adminMe.body.gates) === '{"admin":true,"serverCreator":true}',
  '/me for dev-admin: admin and server creator', JSON.stringify(adminMe.body));
const devMe = await call('/me', dev!.token);
check(devMe.status === 200 && JSON.stringify(devMe.body.gates) === '{"admin":false,"serverCreator":false}', '/me for dev: no gates', JSON.stringify(devMe.body));

const adminCheck = await call(`/check/${server}`, admin!.token);
check(adminCheck.status === 200, 'check: dev-admin holds Manage server', `${adminCheck.status} ${JSON.stringify(adminCheck.body)}`);
const devCheck = await call(`/check/${server}`, dev!.token);
check(devCheck.status === 403 && devCheck.body.type === 'MissingPermission', 'check: dev is refused', `${devCheck.status} ${JSON.stringify(devCheck.body)}`);
const badId = await call('/check/..%2Fusers%2F@me', admin!.token);
check(badId.status === 400 && badId.body.type === 'InvalidId', 'check: a crafted ID is refused before Stoat', `${badId.status} ${badId.body.type}`);

const browser = await launch();
async function open(handle: string) {
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const problems = watch(page);
  await signIn(page, handle);
  return { page, problems };
}
const a = await open('dev-admin');
await a.page.goto(`${APP}/settings/profile`, { waitUntil: 'networkidle' });
const gates = a.page.getByText('Moderator · System admin');
check(await gates.waitFor({ timeout: 10_000 }).then(() => true, () => false), 'settings shows dev-admin’s gates');
const d = await open('dev');
await d.page.goto(`${APP}/settings/profile`, { waitUntil: 'networkidle' });
check(await d.page.getByText('Moderator').count() === 0, 'settings shows dev no gates');
await d.page.context().close();

// dev-admin spends their bucket for the server through the client while the layer checks them every 3.5 s, under
// the per-user limit of 20 writes a minute. Sections are clicked, as people do: a reload would also fetch GET /.
// The layer's lookups take at most 2 of the bucket's 5 per 10 s, once every 30 s.
const limited: string[] = [];
let serverCalls = 0;
a.page.on('response', (r) => {
  if (r.status() === 429) limited.push(r.url());
  if (r.url().includes(`/api/servers/${server}`)) serverCalls++;
});
await a.page.goto(`${APP}/server-settings/${server}/overview`, { waitUntil: 'networkidle' });
const sections = await a.page.locator('.settings nav a.item').count();
let layerCalls = 0;
const layerStatuses = new Set<number>();
const every = Number(process.env.LAYER_CHECK_MS ?? 3_500);
let busy = every > 0;
const checker = (async () => {
  while (busy) {
    layerStatuses.add((await call(`/check/${server}`, admin!.token)).status);
    layerCalls++;
    await new Promise((r) => setTimeout(r, every));
  }
})();
const until = Date.now() + 60_000;
let visits = 0;
while (Date.now() < until) {
  await a.page.locator('.settings nav a.item').nth(visits % sections).click();
  visits++;
  await a.page.waitForTimeout(4_000);
}
busy = false;
await checker;
check(limited.length === 0, `no 429 in the client over ${visits} section visits, ${serverCalls} of its Stoat calls for the server and ${layerCalls} layer checks`, limited.slice(0, 3).join(', '));
check([...layerStatuses].every((s) => s === 200), 'the layer’s checks all answered 200', [...layerStatuses].join(', '));
check(a.problems.console.filter((c) => !c.includes('429')).length === 0, 'no console errors in the client', a.problems.console.slice(0, 3).join(' | '));
await browser.close();

// A flood of random tokens: Stoat sees at most the address limit's worth, the rest get 429 before any Stoat call.
const statuses: number[] = [];
for (let i = 0; i < 30; i++) statuses.push((await call('/me', `flood-${Date.now()}-${i}`)).status);
const first429 = statuses.indexOf(429);
check(first429 > 0 && statuses.slice(first429).every((s) => s === 429) && statuses.slice(0, first429).every((s) => s === 401),
  `a flood of 30 random tokens: ${first429} reached Stoat, the rest got 429`, statuses.join(' '));
const stillIn = await call('/me', admin!.token);
check(stillIn.status === 200, 'dev-admin’s known session still works during the flood', String(stillIn.status));

console.log(failed ? `layer: ${failed} failed` : 'layer: all passed');
process.exit(failed ? 1 : 0);
