/**
 * m2b-plan.md task 6 on the live deployment, with `tuuli` and Playwright's fake clock, so 10 minutes pass
 * in a moment. Each browser context has its own clock, as two devices would.
 * - One device left alone goes Idle, and input there brings it back Online.
 * - A second device in use keeps the first from going Idle, and once it stops, the first goes Idle.
 * - Back on the second device, its next input restores Online.
 * - A chosen Do not disturb is never touched.
 * - Three tabs in one browser going away together send one request.
 * - After a simulated sleep, becoming visible counts as being back.
 * `node tools/live/src/idle.ts`
 */
import type { BrowserContext, Page } from 'playwright-core';
import { APP, launch, watch, type PageProblems } from './browser.ts';
import { signIn } from './login.ts';
import { person, until } from './people.ts';

const results: Record<string, unknown> = {};
const problems: Record<string, PageProblems> = {};
const tuuli = await person('tuuli');
const reset = async () => {
  await tuuli.call('POST', `/sync/settings/set?timestamp=${Date.now()}`, { 'concord:status': 'Online', 'concord:active': '0' });
  await tuuli.call('PATCH', '/users/@me', { status: { presence: 'Online' } });
};
await reset();

const browser = await launch();
async function device(name: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  await context.clock.install();
  const page = await context.newPage();
  problems[name] = watch(page);
  await signIn(page, 'tuuli');
  await page.goto(`${APP}/channels/@me`, { waitUntil: 'networkidle' });
  await page.getByText('Connected').waitFor({ timeout: 15_000 }).catch(() => {});
  // The tab takes the idle lock and starts the tracker just after it connects.
  await page.waitForTimeout(1_000);
  return { context, page };
}
const log = (m: string) => console.error(`[${new Date().toISOString().slice(11, 19)}] ${m}`);
const dot = (page: Page) => page.locator('.dock .me svg.presence').getAttribute('class');
const shows = async (page: Page, state: string) => (await dot(page))?.includes(state) ?? false;
const both = async (label: string) => log(`${label}: A=${await dot(a.page).catch(() => '-')} B=${b ? await dot(b.page).catch(() => '-') : '-'}`);
const touch = (page: Page) => page.mouse.move(200 + Math.random() * 100, 300);
const away = (page: Page, minutes: string) => page.clock.fastForward(minutes);
// Presence writes share the account's 2-per-10-s bucket across devices, so one may wait out a full window.

// One device alone.
log('alone');
let b: { context: BrowserContext; page: Page } | null = null;
const a = await device('A');
await away(a.page, '10:30');
log(`A dot before: ${await dot(a.page)}`);
await until(() => shows(a.page, 'idle'), 15_000).catch(async (e: unknown) => { log(`A dot: ${await dot(a.page)}`); throw e; });
results.aloneGoesIdle = true;
await touch(a.page);
await until(() => shows(a.page, 'online'), 15_000);
results.inputRestoresOnline = true;

// A second device in use keeps A Online; once it stops, A goes Idle.
log('two devices');
await a.page.waitForTimeout(5_500);
b = await device('B');
await away(a.page, '06:00');
await touch(b!.page);
await b!.page.waitForTimeout(1_500);
await away(a.page, '06:00');
await a.page.waitForTimeout(1_500);
await both('after 12 min on A, B touched at 6');
results.otherDeviceKeepsOnline = await shows(a.page, 'online');
await away(a.page, '05:00');
await both('after 5 more on A');
await until(() => shows(a.page, 'idle'), 15_000);
results.idleAfterOtherStops = true;
await both('A idle');
await until(() => shows(b!.page, 'idle'), 15_000);
await b!.page.waitForTimeout(5_500);
await both('before touching B');
await touch(b!.page);
await until(() => shows(a.page, 'online'), 15_000).catch(async (e: unknown) => { await both('restore timed out'); throw e; });
results.otherDeviceRestoresOnline = true;
await b!.context.close();

// A chosen Do not disturb stays.
log('busy');
await a.page.waitForTimeout(5_500);
await a.page.locator('.dock .me').click();
await a.page.getByRole('radio', { name: /^Do not disturb/ }).click();
await until(() => shows(a.page, 'busy'), 15_000);
await away(a.page, '15:00');
await a.page.waitForTimeout(2_000);
results.busyKept = await shows(a.page, 'busy');
await a.page.waitForTimeout(5_500);
await a.page.locator('.dock .me').click();
await a.page.getByRole('radio', { name: /^Online/ }).click();
await until(() => shows(a.page, 'online'), 15_000);
await a.context.close();

// Three tabs in one browser go away together: one request.
log('tabs');
await new Promise((r) => setTimeout(r, 5_500));
const c = await device('C');
const tabs = [c.page, await c.context.newPage(), await c.context.newPage()];
for (const t of tabs.slice(1)) await t.goto(`${APP}/channels/@me`, { waitUntil: 'networkidle' });
await tabs[2]!.getByText('Connected').waitFor({ timeout: 15_000 }).catch(() => {});
let patches = 0;
for (const t of tabs) t.on('request', (r) => { if (r.method() === 'PATCH' && r.url().endsWith('/api/users/@me')) patches++; });
await c.context.clock.fastForward('11:00');
await until(() => shows(tabs[0]!, 'idle'), 15_000);
await c.page.waitForTimeout(2_000);
results.threeTabsRequests = patches;

// A simulated sleep: hidden, time passes, then visible again.
log('sleep');
await c.page.waitForTimeout(5_500);
await touch(c.page);
await until(() => shows(c.page, 'online'), 15_000);
await c.page.waitForTimeout(5_500);
const setVisibility = (state: string) => c.page.evaluate((s) => {
  Object.defineProperty(document, 'visibilityState', { value: s, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}, state);
await setVisibility('hidden');
await c.context.clock.fastForward('11:00');
await until(() => shows(c.page, 'idle'), 15_000);
await setVisibility('visible');
await until(() => shows(c.page, 'online'), 15_000);
results.visibleCountsAsBack = true;
await c.context.close();

await reset();
console.log(JSON.stringify({ ...results, problems }, null, 2));
await browser.close();
