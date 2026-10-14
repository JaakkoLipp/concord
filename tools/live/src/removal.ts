/**
 * m2c-plan.md task 1 on the live deployment: `tuuli` in a browser, `dev-admin` over the API.
 * - tuuli joins a fresh check server over the API and sees its channel without a reload.
 * - A kick, a ban and a deletion each take her to the Friends screen with the right notice.
 * - Six role edits fired at once through the client's REST layer, from Node, all land.
 * `node tools/live/src/removal.ts [out-dir]`
 */
import { join } from 'node:path';
import { StoatBackend } from '../../../packages/stoat/src/backend.ts';
import { LiveTransport } from '../../../packages/stoat/src/live.ts';
import { loadState } from '../../seed/src/config.ts';
import { APP, launch, watch } from './browser.ts';
import { signIn } from './login.ts';
import { person, until } from './people.ts';
import { checkServer, sweep } from './servers.ts';

const out = process.argv[2] ?? '.';
const results: Record<string, unknown> = {};
const [admin, tuuli] = await Promise.all(['dev-admin', 'tuuli'].map(person));
results.sweptBefore = await sweep(admin!, [tuuli!]);

const browser = await launch();
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await context.newPage();
const problems = watch(page);
await signIn(page, 'tuuli');
await page.goto(`${APP}/channels/@me`, { waitUntil: 'networkidle' });
await page.getByText('Connected').waitFor({ timeout: 15_000 }).catch(() => {});

const s = await checkServer(admin!, `removal ${Date.now() % 100000}`);
const rail = () => page.locator('nav[aria-label="Servers"]').getByRole('link', { name: s.name });
const timed = async (action: () => Promise<unknown>, check: () => Promise<boolean>) => {
  const start = performance.now();
  await action();
  await until(check, 15_000);
  return Math.round(performance.now() - start);
};

/** Join, open the server, and wait for its channel: own member record fetched, so the channel shows. */
async function joinAndOpen(): Promise<number> {
  const ms = await timed(() => tuuli!.call('POST', `/invites/${s.invite}`), () => rail().isVisible());
  await rail().click();
  await page.getByRole('link', { name: 'General' }).waitFor({ timeout: 10_000 });
  await page.waitForURL(new RegExp(`/channels/${s.id}/`));
  return ms;
}
async function removed(action: () => Promise<unknown>, notice: string): Promise<{ ms: number; atFriends: boolean }> {
  const ms = await timed(action, async () => page.url().endsWith('/channels/@me') && (await page.getByText(notice).isVisible()));
  return { ms, atFriends: !(await rail().isVisible()) };
}

results.joinMs = await joinAndOpen();
results.channelShownWithoutReload = true;
results.kick = await removed(() => admin!.call('DELETE', `/servers/${s.id}/members/${tuuli!.id}`), `You were removed from ${s.name}.`);
await page.screenshot({ path: join(out, 'removal-kick.png') });
await joinAndOpen();
results.ban = await removed(() => admin!.call('PUT', `/servers/${s.id}/bans/${tuuli!.id}`, { reason: 'testi' }), `You were banned from ${s.name}.`);
await admin!.call('DELETE', `/servers/${s.id}/bans/${tuuli!.id}`);
await joinAndOpen();

// Six role edits at once, through the client's own REST layer: one bucket of 5 a 10 s, so one must wait.
const backend = new StoatBackend(new LiveTransport(loadState()!.backend));
backend.setToken(admin!.token);
const roles = [];
for (let i = 0; i < 6; i++) roles.push(await backend.createRole(s.id, `r${i}`));
const start = performance.now();
const settled = await Promise.allSettled(roles.map((r, i) => backend.editRole(s.id, r.id, { name: `rooli ${i}`, colour: '#3dbd7d' })));
results.burst = {
  ms: Math.round(performance.now() - start),
  failed: settled.filter((x) => x.status === 'rejected').map((x) => String((x as PromiseRejectedResult).reason)),
  landed: Object.values((await admin!.call<{ roles: Record<string, { name: string }> }>('GET', `/servers/${s.id}`)).roles).filter((r) => r.name.startsWith('rooli ')).length,
};

results.deleted = await removed(() => admin!.call('DELETE', `/servers/${s.id}`), `${s.name} was deleted.`);
await page.screenshot({ path: join(out, 'removal-deleted.png') });

results.sweptAfter = await sweep(admin!, [tuuli!]);
console.log(JSON.stringify({ ...results, problems }, null, 2));
await browser.close();
