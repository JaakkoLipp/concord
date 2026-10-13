/**
 * m2b-plan.md task 5 on the live deployment: `dev` on two devices (A and B) and `aino`, a friend with a DM.
 * - A picks Do not disturb in the status menu: timed until B's dock and aino's DM row show it.
 * - Five quick picks make at most two PATCH /users/@me requests and end on the last choice.
 * - A custom status with an emoji from the picker reaches aino.
 * - Invisible survives a reload in A's menu, and aino sees dev offline.
 * dev's status is put back at the end. `node tools/live/src/status.ts [out-dir]`
 */
import { join } from 'node:path';
import type { Page } from 'playwright-core';
import { loadState } from '../../seed/src/config.ts';
import { APP, launch, watch } from './browser.ts';
import { signIn } from './login.ts';
import { person, until } from './people.ts';

const out = process.argv[2] ?? '.';
const st = loadState()!;
const results: Record<string, unknown> = {};
const dev = await person('dev');
const before = await dev.call<{ status?: { text?: string; presence?: string } }>('GET', '/users/@me');

const browser = await launch();
async function open(handle: string, path: string) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  const problems = watch(page);
  await signIn(page, handle);
  await page.goto(`${APP}${path}`, { waitUntil: 'networkidle' });
  await page.getByText('Connected').waitFor({ timeout: 15_000 }).catch(() => {});
  return { page, problems };
}
const timed = async (action: () => Promise<unknown>, check: () => Promise<boolean>) => {
  const start = performance.now();
  await action();
  await until(check);
  return Math.round(performance.now() - start);
};
const pick = async (page: Page, name: string) => {
  await page.locator('.dock .me').click();
  await page.getByRole('radio', { name: new RegExp(`^${name}`) }).click();
};
const dock = (page: Page, state: string) => page.locator(`.dock .me svg.presence.${state}`);
const devRow = (page: Page) => page.locator('nav[aria-label="Direct messages"] .row-wrap', { hasText: 'Dev' });

const a = await open('dev', '/channels/@me');
const b = await open('dev', '/channels/@me');
const c = await open('aino', `/channels/@me/${st.channels['dm-aino']}`);
let patches = 0;
a.page.on('request', (r) => { if (r.method() === 'PATCH' && r.url().endsWith('/api/users/@me')) patches++; });

// One choice, to the other device and to a friend.
results.busyToOtherDeviceMs = await timed(() => pick(a.page, 'Do not disturb'), () => dock(b.page, 'busy').isVisible());
await until(() => devRow(c.page).locator('svg.presence.busy').isVisible());
results.busyToFriend = true;

// A burst of five, after the queue's 5 s gap.
await a.page.waitForTimeout(5_500);
patches = 0;
for (const name of ['Idle', 'Focus', 'Do not disturb', 'Idle', 'Online']) {
  await pick(a.page, name);
  await a.page.waitForTimeout(150);
}
await a.page.waitForTimeout(6_000);
results.burstRequests = patches;
results.burstEndsOnline = await dock(b.page, 'online').isVisible() && await devRow(c.page).locator('svg.presence.online').isVisible();

// Custom status with an emoji from the picker.
await a.page.locator('.dock .me').click();
await a.page.getByRole('button', { name: /custom status/ }).click();
const dialog = a.page.getByRole('dialog', { name: 'Custom status' });
// Start from no emoji, whatever the status had.
if (await dialog.getByRole('button', { name: 'Remove the emoji' }).isVisible()) await dialog.getByRole('button', { name: 'Remove the emoji' }).click();
await dialog.getByRole('button', { name: 'Choose an emoji' }).click();
await a.page.keyboard.type('fire');
await dialog.getByRole('button', { name: ':fire:', exact: true }).click();
await dialog.getByPlaceholder("What's happening?").fill('Testaan tilaa');
await a.page.screenshot({ path: join(out, 'status-dialog.png') });
results.customStatusMs = await timed(() => dialog.getByRole('button', { name: 'Save' }).click(), () => devRow(c.page).getByText('🔥 Testaan tilaa').isVisible()).catch(async (e: unknown) => {
  await c.page.screenshot({ path: join(out, 'status-aino.png') });
  console.log('row text:', await devRow(c.page).innerText(), 'dock:', await a.page.locator('.dock .sub').innerText());
  throw e;
});
await a.page.screenshot({ path: join(out, 'status-dock.png') });

// Invisible, then a reload.
await a.page.waitForTimeout(5_500);
await pick(a.page, 'Invisible');
await until(() => devRow(c.page).locator('svg.presence.offline').isVisible());
results.invisibleToFriend = 'offline';
await a.page.reload({ waitUntil: 'networkidle' });
await a.page.getByText('Connected').waitFor({ timeout: 15_000 }).catch(() => {});
await a.page.locator('.dock .me').click();
results.invisibleAfterReload = await a.page.getByRole('radio', { name: /^Invisible/ }).getAttribute('aria-checked');
await a.page.screenshot({ path: join(out, 'status-menu.png') });

// Put dev back.
await a.page.keyboard.press('Escape');
await a.page.waitForTimeout(5_500);
await pick(a.page, 'Online');
await a.page.waitForTimeout(5_500);
const text = before.status?.text;
await dev.call('PATCH', '/users/@me', { status: { presence: before.status?.presence ?? 'Online', ...(text ? { text } : {}) }, ...(text ? {} : { remove: ['StatusText'] }) });
console.log(JSON.stringify({ ...results, a: a.problems, b: b.problems, aino: c.problems }, null, 2));
await browser.close();
