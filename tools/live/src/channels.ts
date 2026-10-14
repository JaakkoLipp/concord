/**
 * m2c-plan.md task 3 on the live deployment: `dev-admin` builds the seeded server's categories and channels
 * in the sidebar of a fresh check server, with `tuuli` watching in a second browser.
 * - Four categories and ten channels, General renamed to `yleinen` and moved by the Move dialog.
 * - Five quick Move up clicks, then five Move down, end where they should with no jump back.
 * - One move by keyboard alone, through the context menu.
 * - A deleted channel leaves no gap, here or for tuuli.
 * `node tools/live/src/channels.ts [out-dir]`
 */
import { join } from 'node:path';
import type { Page } from 'playwright-core';
import { APP, launch, watch } from './browser.ts';
import { signIn } from './login.ts';
import { person, until } from './people.ts';
import { checkServer, sidebar, sweep } from './servers.ts';

const out = process.argv[2] ?? '.';
const results: Record<string, unknown> = {};
const [admin, tuuli] = await Promise.all(['dev-admin', 'tuuli'].map(person));
results.sweptBefore = await sweep(admin!, [tuuli!]);
const s = await checkServer(admin!, `channels ${Date.now() % 100000}`, true);
await tuuli!.call('POST', `/invites/${s.invite}`);

const browser = await launch();
async function open(handle: string) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  await context.addInitScript(() => {
    const w = window as unknown as { __closes: string[] };
    w.__closes = [];
    const orig = HTMLDialogElement.prototype.close;
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement, ...args: [string?]) {
      w.__closes.push(`${this.querySelector('h2')?.textContent} ${new Error().stack?.split('\n').slice(1, 7).join(' <- ')}`);
      return orig.apply(this, args);
    };
  });
  const page = await context.newPage();
  const problems = watch(page);
  await signIn(page, handle);
  await page.goto(`${APP}/channels/${s.id}/${s.general}`, { waitUntil: 'networkidle' });
  await page.getByText('Connected').waitFor({ timeout: 15_000 }).catch(() => {});
  return { page, problems };
}
const a = await open('dev-admin');
const t = await open('tuuli');
const dialog = (page: Page) => page.locator('dialog[open]');
const channel = (page: Page, name: string) => page.locator('nav[aria-label="Channels"] a.channel', { has: page.locator('.name', { hasText: new RegExp(`^${name}$`) }) });

async function serverMenu(item: string) {
  await a.page.getByRole('button', { name: /menu$/ }).click();
  await a.page.getByRole('menuitem', { name: item }).click();
}
async function createCategory(title: string) {
  await serverMenu('Create category');
  await dialog(a.page).getByLabel('Category name').fill(title);
  await dialog(a.page).getByRole('button', { name: 'Create category' }).click();
  await a.page.locator('nav[aria-label="Channels"] .category', { hasText: title }).waitFor();
}
async function createChannel(category: string, name: string, voice = false) {
  await a.page.getByRole('button', { name: `Create channel in ${category}` }).click();
  if (voice) await dialog(a.page).getByText('Voice', { exact: true }).click();
  await dialog(a.page).getByLabel('Channel name').fill(name);
  await dialog(a.page).getByRole('button', { name: 'Create channel' }).click({ timeout: 10_000 }).catch(async (e: unknown) => {
    await a.page.screenshot({ path: join(out, 'channels-fail.png') });
    console.log('DIALOGS', await a.page.locator('dialog').evaluateAll((ds) => ds.map((d) => `${(d as HTMLDialogElement).open}:${d.querySelector('h2')?.textContent}`)));
    console.log('MENUS', await a.page.locator('[role=menu]').count(), await a.page.evaluate(() => document.activeElement?.outerHTML.slice(0, 200)));
    console.log('CLOSES', JSON.stringify((await a.page.evaluate(() => (window as unknown as { __closes: string[] }).__closes)).slice(-3), null, 1));
    throw e;
  });
  await channel(a.page, name).waitFor({ timeout: 30_000 });
}
async function contextMenu(name: string, item: string) {
  await channel(a.page, name).click({ button: 'right' });
  await a.page.getByRole('menuitem', { name: item }).click();
}

const start = performance.now();
for (const title of ['Tervetuloa', 'Yleinen', 'Pelit', 'Tekniikka']) await createCategory(title);
// General becomes #yleinen: moved with the dialog, renamed in channel settings.
await contextMenu('General', 'Move to category…');
await dialog(a.page).getByLabel('Category').selectOption({ label: 'Yleinen' });
await dialog(a.page).getByRole('button', { name: 'Move' }).click();
await contextMenu('General', 'Edit channel');
await a.page.getByLabel('Channel name').fill('yleinen');
await a.page.getByRole('button', { name: 'Save changes' }).click();
await a.page.getByText('You have unsaved changes.').waitFor({ state: 'hidden' });
await a.page.keyboard.press('Escape');
await a.page.locator('nav[aria-label="Channels"]').waitFor();
for (const [category, name, voice] of [
  ['Tervetuloa', 'säännöt'], ['Tervetuloa', 'ilmoitukset'], ['Yleinen', 'off-topic'], ['Yleinen', 'kuvat ja videot'], ['Yleinen', 'Olohuone', true],
  ['Pelit', 'pelit'], ['Pelit', 'Pelaamo', true], ['Tekniikka', 'tekniikka'], ['Tekniikka', 'botti'],
] as [string, string, boolean?][]) await createChannel(category, voice ? name : name.toLowerCase().replace(/ /g, '-'), voice);
await contextMenu('tekniikka', 'Edit channel');
await a.page.getByLabel('Description').fill('Koodi, Linux, rauta. Code, Linux, hardware.');
await a.page.getByRole('button', { name: 'Save changes' }).click();
await a.page.getByText('You have unsaved changes.').waitFor({ state: 'hidden' });
await a.page.keyboard.press('Escape');
await a.page.locator('nav[aria-label="Channels"]').waitFor();
results.buildMs = Math.round(performance.now() - start);

const expected = [
  'Tervetuloa: säännöt, ilmoitukset', 'Yleinen: yleinen, off-topic, kuvat-ja-videot, Olohuone', 'Pelit: pelit, Pelaamo', 'Tekniikka: tekniikka, botti',
];
const same = async (page: Page) => JSON.stringify(await sidebar(page)) === JSON.stringify(expected);
await until(() => same(t.page), 30_000);
results.built = { admin: await sidebar(a.page), tuuliMatches: await same(t.page) };

// Five quick moves up, then five down: botti travels into Yleinen and back.
for (const dir of ['Move up', 'Move down']) {
  for (let i = 0; i < 5; i++) await contextMenu('botti', dir);
  if (dir === 'Move up') {
    const mid = await sidebar(a.page);
    results.afterFiveUp = mid;
  }
}
let jumped = false;
const settleStart = Date.now();
while (Date.now() - settleStart < 25_000) {
  if (!(await same(a.page))) jumped = true;
  if (await same(t.page) && Date.now() - settleStart > 3_000 && !jumped) break;
  await a.page.waitForTimeout(100);
}
results.quickMoves = { jumpedBack: jumped, adminFinal: await same(a.page), tuuliFinal: await same(t.page), settledMs: Date.now() - settleStart };

// By keyboard: focus a channel, open its menu with the context-menu key, pick Move down, then put it back.
await channel(a.page, 'säännöt').focus();
await a.page.keyboard.press('Shift+F10');
await a.page.getByRole('menuitem', { name: 'Move down' }).waitFor();
await a.page.keyboard.press('ArrowDown');
let picked = await a.page.evaluate(() => document.activeElement?.textContent);
while (picked !== 'Move down') { await a.page.keyboard.press('ArrowDown'); picked = await a.page.evaluate(() => document.activeElement?.textContent); }
await a.page.keyboard.press('Enter');
await until(async () => (await sidebar(t.page))[0] === 'Tervetuloa: ilmoitukset, säännöt', 30_000).catch(async (e: unknown) => {
  await a.page.screenshot({ path: join(out, 'channels-fail.png') });
  console.log(JSON.stringify({ ...results, picked, admin: await sidebar(a.page), tuuli: await sidebar(t.page) }, null, 2));
  throw e;
});
results.keyboardMove = true;
await contextMenu('säännöt', 'Move up');
await until(() => same(t.page), 30_000);

// A channel created and deleted leaves nothing behind.
await createChannel('Pelit', 'poistettava');
await until(async () => (await sidebar(t.page))[2] === 'Pelit: pelit, Pelaamo, poistettava', 30_000);
await contextMenu('poistettava', 'Delete channel');
await dialog(a.page).getByRole('button', { name: 'Delete channel' }).click();
await until(async () => (await same(a.page)) && (await same(t.page)), 30_000);
results.deleteLeavesNoGap = true;
// The admin had the deleted channel open: they land on the server's first channel, not the Friends screen.
await until(async () => /\/channels\/[0-9A-Z]{26}\/[0-9A-Z]{26}$/.test(a.page.url()) && !a.page.url().includes('@me'), 10_000);
results.afterDeleteUrl = a.page.url().split('/').slice(-2).join('/') === `${s.id}/${(await admin!.call<{ categories: { channels: string[] }[] }>('GET', `/servers/${s.id}`)).categories[0]!.channels[0]}` ? 'first channel' : a.page.url();
await a.page.screenshot({ path: join(out, 'channels-admin.png') });
await t.page.screenshot({ path: join(out, 'channels-tuuli.png') });

results.sweptAfter = await sweep(admin!, [tuuli!]);
console.log(JSON.stringify({ ...results, problems: { admin: a.problems, tuuli: t.problems } }, null, 2));
await browser.close();
