/**
 * m2c-plan.md task 7 on the live deployment: `dev-admin` manages emoji in a fresh check server while `tuuli`
 * looks them up in her composer's autocomplete.
 * - Three uploads, the first named from its file; tuuli finds each and sends one.
 * - A rename and a delete reach her autocomplete.
 * - A 600 KB image and a bad name are refused before anything is uploaded.
 * `node tools/live/src/emoji.ts [out-dir]`
 */
import { join } from 'node:path';
import type { Page } from 'playwright-core';
import { APP, launch, watch } from './browser.ts';
import { signIn } from './login.ts';
import { person, until } from './people.ts';
import { checkServer, sweep } from './servers.ts';
import { emojiShape, encodePng } from '../../seed/src/png.ts';
import { Rng } from '../../seed/src/rng.ts';

const out = process.argv[2] ?? '.';
const results: Record<string, unknown> = {};
const [admin, tuuli] = await Promise.all(['dev-admin', 'tuuli'].map(person));
results.sweptBefore = await sweep(admin!, [tuuli!]);
const s = await checkServer(admin!, `emoji ${Date.now() % 100000}`, true);
await tuuli!.call('POST', `/invites/${s.invite}`);

const browser = await launch();
async function open(handle: string, path: string) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await context.newPage();
  const problems = watch(page);
  await signIn(page, handle);
  await page.goto(`${APP}${path}`, { waitUntil: 'networkidle' });
  await page.getByText('Connected').waitFor({ timeout: 15_000 }).catch(() => {});
  return { page, problems };
}
const a = await open('dev-admin', `/server-settings/${s.id}/emoji`);
const t = await open('tuuli', `/channels/${s.id}/${s.general}`);
const editor = t.page.locator('.composer .cm-content');

/** Whether tuuli's autocomplete offers this name for `:query`. */
async function offered(query: string, name: string): Promise<boolean> {
  await editor.click();
  await t.page.keyboard.press('Control+A');
  await t.page.keyboard.press('Backspace');
  await t.page.keyboard.type(`:${query}`);
  const found = await t.page.getByRole('option', { name: new RegExp(`:${name}:`) }).isVisible().catch(() => false);
  return found;
}
const png = (i: number) => Buffer.from(emojiShape(new Rng(300 + i), i));
const fileInput = () => a.page.getByLabel('Choose image');

// 1. Three uploads. The first is named from its file.
const names = ['kahvi_kuppi', 'sauna2', 'kolmas'];
const times: number[] = [];
for (const [i, n] of names.entries()) {
  await fileInput().setInputFiles({ name: i === 0 ? 'Kahvi Kuppi.png' : `${n}.png`, mimeType: 'image/png', buffer: png(i) });
  if (i === 0) results.nameFromFile = await a.page.getByLabel('Name', { exact: true }).inputValue();
  const sent = a.page.waitForRequest((r) => r.method() === 'PUT' && r.url().includes('/custom/emoji/')).then(() => performance.now());
  await a.page.getByRole('button', { name: 'Upload emoji' }).click();
  const at = await sent;
  await a.page.locator(`li.emoji[data-emoji="${n}"]`).waitFor();
  await until(() => offered(n, n), 15_000);
  times.push(Math.round(performance.now() - at));
}
results.offeredMs = times;
results.slots = await a.page.getByText(/slots left/).textContent();

// tuuli sends the first one through autocomplete.
// A query only the new emoji matches: the seeded server has one called kahvi.
await offered('kahvi_k', 'kahvi_kuppi');
await t.page.keyboard.press('Enter');
await t.page.keyboard.press('Enter');
await until(async () => (await t.page.locator('img[alt=":kahvi_kuppi:"]').count()) > 0, 15_000).catch(async (e: unknown) => {
  await t.page.screenshot({ path: join(out, 'emoji-fail.png') });
  console.log('images', JSON.stringify(await t.page.locator('img.emoji').evaluateAll((els) => els.map((e) => e.getAttribute('alt')))));
  throw e;
});
results.sentInMessage = true;

// 2. A rename and a delete.
const nameInput = a.page.getByLabel('Rename :sauna2:');
await nameInput.fill('sauna_uusi');
await nameInput.press('Enter');
await until(() => offered('sauna_u', 'sauna_uusi'), 15_000);
results.renameReached = true;
await a.page.getByRole('button', { name: 'Delete :kolmas:' }).click();
await a.page.locator('dialog[open]').getByRole('button', { name: 'Delete' }).click();
await until(async () => !(await offered('kolma', 'kolmas')), 15_000);
results.deleteReached = true;

// 3. Refused before uploading: a 600 KB image and a bad name.
let uploads = 0;
a.page.on('request', (r) => { if (r.url().includes('/autumn/')) uploads++; });
const big = Buffer.from(encodePng(1000, 1000, (x, y) => [(x * 7 + y) & 255, (y * 13) & 255, (x ^ y) & 255, 255]));
results.bigFileBytes = big.length;
await fileInput().setInputFiles({ name: 'iso.png', mimeType: 'image/png', buffer: big });
results.bigRefused = await a.page.getByText('The image must be 0.5 MB or smaller.').isVisible();
await fileInput().setInputFiles({ name: 'ok.png', mimeType: 'image/png', buffer: png(9) });
await a.page.getByLabel('Name', { exact: true }).fill('Bad Name');
results.badNameRefused = { message: await a.page.getByText('Use only a–z, 0–9 and _, 1 to 32 characters.').isVisible(), buttonDisabled: await a.page.getByRole('button', { name: 'Upload emoji' }).isDisabled() };
results.uploadsWhileRefusing = uploads;
await a.page.screenshot({ path: join(out, 'emoji-admin.png') });

results.sweptAfter = await sweep(admin!, [tuuli!]);
console.log(JSON.stringify({ ...results, problems: { admin: a.problems, tuuli: t.problems } }, null, 2));
await browser.close();
