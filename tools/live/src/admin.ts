/**
 * m2c-plan.md task 2 on the live deployment: `dev-admin` and `tuuli` in browsers, `dev` in a third.
 * - dev-admin creates a server with an icon through "+"; the API shows the bootstrap done.
 * - A server made over the API, without the bootstrap, shows "Setup didn't finish"; Retry finishes it.
 * - tuuli joins; Overview changes to the name, description, icon, banner and join messages show for her live.
 * - tuuli leaves one server through the server menu; dev-admin deletes the other through settings.
 * - dev sees no "+" and no Server settings in the seeded server.
 * `node tools/live/src/admin.ts [out-dir]`
 */
import { join } from 'node:path';
import type { Page } from 'playwright-core';
import { encodePng } from '../../seed/src/png.ts';
import { Permission } from '../../../packages/domain/src/permissions.ts';
import { loadState } from '../../seed/src/config.ts';
import { APP, launch, watch } from './browser.ts';
import { signIn } from './login.ts';
import { person, until } from './people.ts';
import { PREFIX, checkServer, sweep } from './servers.ts';

const out = process.argv[2] ?? '.';
const results: Record<string, unknown> = {};
const [admin, tuuli, onni] = await Promise.all(['dev-admin', 'tuuli', 'onni'].map(person));
results.sweptBefore = await sweep(admin!, [tuuli!, onni!]);
const run = Date.now() % 100000;
const ALL = Object.values(Permission).reduce((x, y) => x | y, 0n);

const browser = await launch();
async function open(handle: string) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  const problems = watch(page);
  await signIn(page, handle);
  await page.goto(`${APP}/channels/@me`, { waitUntil: 'networkidle' });
  await page.getByText('Connected').waitFor({ timeout: 15_000 }).catch(() => {});
  return { page, problems };
}
const rail = (page: Page, name: string) => page.locator('nav[aria-label="Servers"]').getByRole('link', { name, exact: true });
const png = (r: number, g: number, b: number, w = 128, h = 128) => Buffer.from(encodePng(w, h, (x, y) => [r ^ (x & 32), g ^ (y & 32), b, 255]));
const timed = async (action: () => Promise<unknown>, check: () => Promise<boolean>) => {
  const start = performance.now();
  await action();
  await until(check, 15_000);
  return Math.round(performance.now() - start);
};

const a = await open('dev-admin');
const t = await open('tuuli');

// 1. Create a server with an icon.
const name = `${PREFIX} ${run}`;
await a.page.getByRole('button', { name: 'Create a server' }).click();
const dialog = a.page.getByRole('dialog');
await dialog.getByLabel('Server name').fill(name);
await dialog.locator('input[type=file]').setInputFiles({ name: 'icon.png', mimeType: 'image/png', buffer: png(30, 160, 200) });
await dialog.getByRole('button', { name: 'Create' }).click();
await a.page.waitForURL(/\/channels\/[0-9A-Z]{26}\/[0-9A-Z]{26}$/, { timeout: 20_000 });
const server = a.page.url().split('/').at(-2)!;
type WServer = { name: string; description?: string; icon?: object; banner?: object; default_permissions: number; roles?: Record<string, { name: string; rank: number; permissions: { a: number; d: number } }>; system_messages?: Record<string, string>; channels: string[] };
const get = () => admin!.call<WServer>('GET', `/servers/${server}`);
/** Polls the API gently: it shares dev-admin's 5-per-10-s server bucket with the browser's saves. */
const slowly = async (check: () => Promise<boolean>) => { for (let i = 0; i < 10 && !(await check()); i++) await new Promise((r) => setTimeout(r, 2_500)); };
await slowly(async () => Object.keys((await get()).roles ?? {}).length > 0);
const made = await get();
const roles = Object.values(made.roles ?? {});
results.create = {
  everyoneCanInvite: (BigInt(made.default_permissions) & (1n << 25n)) !== 0n,
  roles: roles.map((r) => `${r.name}:${r.rank}`),
  adminHasEverything: roles[0] ? BigInt(roles[0].permissions.a) === ALL : false,
  icon: !!made.icon,
  bannerShownForSetup: await a.page.getByText("Setup didn’t finish").isVisible(),
};

// 2. A server made without the bootstrap: the banner, then Retry.
const bare = await checkServer(admin!, `bare ${run}`);
await rail(a.page, bare.name).click();
await a.page.getByText('Setup didn’t finish').waitFor({ timeout: 10_000 });
await a.page.getByRole('button', { name: 'Retry' }).click();
await a.page.getByText('Setup didn’t finish').waitFor({ state: 'hidden', timeout: 30_000 });
const fixed = await admin!.call<WServer>('GET', `/servers/${bare.id}`);
// The settings writes above used dev-admin's bucket: let it refill, so the timing below is the save itself.
await new Promise((r) => setTimeout(r, 10_000));
results.retry = { everyoneCanInvite: (BigInt(fixed.default_permissions) & (1n << 25n)) !== 0n, roles: Object.values(fixed.roles ?? {}).map((r) => r.name) };

// 3. tuuli joins both; Overview changes reach her live.
const invite = await admin!.call<{ _id: string }>('POST', `/channels/${made.channels[0]}/invites`);
await tuuli!.call('POST', `/invites/${invite._id}`);
await tuuli!.call('POST', `/invites/${bare.invite}`);
await until(() => rail(t.page, name).isVisible());
await rail(t.page, name).click();
await t.page.waitForURL(new RegExp(`/channels/${server}/`));

await rail(a.page, name).click();
await a.page.getByRole('button', { name: `${name} menu` }).click();
await a.page.getByRole('menuitem', { name: 'Server settings' }).click();
await a.page.waitForURL(/server-settings\/[0-9A-Z]{26}\/overview$/);
const renamed = `${PREFIX} uusi ${run}`;
await a.page.getByLabel('Server name').fill(renamed);
await a.page.getByLabel('Description').fill('Testipalvelin');
await a.page.locator('input[type=file]').nth(0).setInputFiles({ name: 'icon2.png', mimeType: 'image/png', buffer: png(220, 60, 90) });
await a.page.locator('input[type=file]').nth(1).setInputFiles({ name: 'banner.png', mimeType: 'image/png', buffer: png(40, 90, 200, 480, 200) });
await a.page.getByLabel('Joins').selectOption({ label: '#General' });
await a.page.screenshot({ path: join(out, 'admin-overview.png') });
results.overviewMs = await timed(() => a.page.getByRole('button', { name: 'Save changes' }).click(), async () =>
  (await rail(t.page, renamed).isVisible()) && (await t.page.locator('img.banner').isVisible()) && (await rail(t.page, renamed).locator('img').isVisible()));
const after = await get();
results.overviewSaved = { name: after.name === renamed, description: after.description, icon: !!after.icon, banner: !!after.banner, joins: after.system_messages?.user_joined === made.channels[0] };
results.saveBarGone = await a.page.getByText('You have unsaved changes.').isHidden();
results.joinLineMs = await timed(() => onni!.call('POST', `/invites/${invite._id}`), () => t.page.getByText('onni joined the server.').isVisible());
await t.page.screenshot({ path: join(out, 'admin-tuuli.png') });

// 4. tuuli leaves the bare server through its menu: no notice, back to Friends.
await rail(t.page, bare.name).click();
await t.page.getByRole('button', { name: `${bare.name} menu` }).click();
await t.page.getByRole('menuitem', { name: 'Leave server' }).click();
await t.page.getByRole('dialog').getByRole('button', { name: 'Leave server' }).click();
await until(async () => t.page.url().endsWith('/channels/@me') && !(await rail(t.page, bare.name).isVisible()));
results.leftQuietly = !(await t.page.getByText(`removed from`).isVisible());

// 5. dev-admin deletes the server through settings; tuuli is told.
await a.page.getByRole('button', { name: 'Delete server' }).click();
const del = a.page.locator('dialog[open]');
await del.getByLabel('Type the server’s name to confirm').fill(renamed);
results.deleteMs = await timed(() => del.getByRole('button', { name: 'Delete server' }).click(), () => t.page.getByText(`${renamed} was deleted.`).isVisible());
await a.page.waitForURL(/\/channels\/@me$/);

// 6. dev, a plain member: no "+", no Server settings in the seeded server.
const d = await open('dev');
const seeded = loadState()!.serverId;
results.devPlus = await d.page.getByRole('button', { name: 'Create a server' }).count();
await d.page.goto(`${APP}/channels/${seeded}/${loadState()!.channels.yleinen}`, { waitUntil: 'networkidle' });
const header = d.page.getByRole('button', { name: /menu$/ });
await header.click();
results.devMenu = await d.page.getByRole('menuitem').allTextContents();
await d.page.keyboard.press('Escape');

results.sweptAfter = await sweep(admin!, [tuuli!, onni!]);
console.log(JSON.stringify({ ...results, problems: { admin: a.problems, tuuli: t.problems, dev: d.problems } }, null, 2));
await browser.close();
