/**
 * M2a task 9, the acceptance check (milestones.md M2a), on the live deployment: `node tools/live/src/m2a.ts`.
 * 1. `dev` and `aino` in #botti, in two browsers: delivery time of a message, an edit, a delete, a reaction
 *    and typing, five times each, from the action in one browser to the change in the other.
 * 2. `dev` on two "devices" in other channels while `aino` mentions `dev` in #botti: both show the unread
 *    marker and the mention badge, and reading on one clears both on the other.
 */
import type { Page } from 'playwright-core';
import { loadState } from '../../seed/src/config.ts';
import { APP, launch, watch } from './browser.ts';
import { signIn } from './login.ts';

const RUNS = 5;
const st = loadState()!;
const browser = await launch();
const open = async (handle: string, key: string) => {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  const problems = watch(page);
  await signIn(page, handle);
  await page.goto(`${APP}/channels/${st.serverId}/${st.channels[key]}`, { waitUntil: 'networkidle' });
  await page.locator('.composer .cm-content').waitFor();
  return { page, problems };
};
/** Poll every 10 ms until the condition holds in the page; the delay since `t0`, on a monotonic clock. */
const until = async (page: Page, t0: number, check: () => Promise<boolean>, timeout = 10_000) => {
  while (performance.now() - t0 < timeout) {
    if (await check()) return Math.round(performance.now() - t0);
    await page.waitForTimeout(10);
  }
  return Number.NaN;
};
const row = (page: Page, text: string) => page.locator('article.message', { hasText: text }).last();
const type = async (page: Page, text: string) => {
  await page.locator('.composer .cm-content').click();
  await page.keyboard.type(text);
};
const summary = (ms: number[]) => {
  const ok = ms.filter((x) => !Number.isNaN(x)).sort((a, b) => a - b);
  return { median: ok[Math.floor(ok.length / 2)] ?? null, max: ok.at(-1) ?? null, missed: ms.length - ok.length };
};

const a = await open('dev', 'botti');
const b = await open('aino', 'botti');
const times: Record<string, number[]> = { message: [], edit: [], delete: [], reaction: [], typingStart: [], typingStop: [] };

for (let i = 0; i < RUNS; i++) {
  const tag = `${Date.now().toString(36)}-${i}`;
  // Message.
  await type(a.page, `hyväksyntä ${tag}`);
  let t0 = performance.now();
  await a.page.keyboard.press('Enter');
  times.message!.push(await until(b.page, t0, () => row(b.page, `hyväksyntä ${tag}`).isVisible().catch(() => false)));
  // Edit with Up arrow.
  await a.page.locator('.composer .cm-content').click();
  await a.page.keyboard.press('ArrowUp');
  await a.page.locator('.edit .cm-content').waitFor();
  await a.page.keyboard.press('Control+End');
  await a.page.keyboard.type(' muokattu');
  t0 = performance.now();
  await a.page.keyboard.press('Enter');
  times.edit!.push(await until(b.page, t0, async () => (await row(b.page, `hyväksyntä ${tag}`).innerText()).includes('muokattu')));
  // Reaction from b, seen by a.
  await row(b.page, `hyväksyntä ${tag}`).hover();
  await row(b.page, `hyväksyntä ${tag}`).getByRole('button', { name: 'Add reaction' }).first().click();
  await b.page.getByRole('searchbox', { name: 'Find the perfect emoji' }).fill('thumbsup');
  await b.page.locator('.picker .grid button').first().waitFor();
  t0 = performance.now();
  await b.page.getByRole('searchbox', { name: 'Find the perfect emoji' }).press('Enter');
  times.reaction!.push(await until(a.page, t0, () => row(a.page, `hyväksyntä ${tag}`).locator('.chip', { hasText: '1' }).first().isVisible().catch(() => false)));
  // Typing start and stop, from a.
  await a.page.locator('.composer .cm-content').click();
  t0 = performance.now();
  await a.page.keyboard.type('k');
  times.typingStart!.push(await until(b.page, t0, async () => (await b.page.locator('.typing').innerText()).includes('typing')));
  t0 = performance.now();
  await a.page.keyboard.press('Backspace');
  times.typingStop!.push(await until(b.page, t0, async () => (await b.page.locator('.typing').innerText()) === ''));
  // Delete with Shift+click.
  await row(a.page, `hyväksyntä ${tag}`).hover();
  await row(a.page, `hyväksyntä ${tag}`).getByRole('button', { name: 'More' }).click();
  await a.page.getByRole('menuitem', { name: 'Delete message' }).waitFor();
  await a.page.waitForTimeout(300);
  t0 = performance.now();
  await a.page.getByRole('menuitem', { name: 'Delete message' }).click({ modifiers: ['Shift'] });
  times.delete!.push(await until(b.page, t0, async () => (await row(b.page, `hyväksyntä ${tag}`).count()) === 0));
}

// Unread and mentions across two devices of one account.
await a.page.goto(`${APP}/channels/${st.serverId}/${st.channels.pelit}`, { waitUntil: 'networkidle' });
const a2 = await open('dev', 'offtopic');
const label = (p: Page) => p.locator('.channel', { hasText: 'botti' }).first().getAttribute('aria-label');
const unread: Record<string, unknown> = {};
await b.page.bringToFront();
await type(b.page, '@dev');
await b.page.getByRole('listbox', { name: 'Suggestions' }).waitFor();
await b.page.keyboard.press('Enter');
await b.page.keyboard.type(`katso tätä ${Date.now().toString(36)}`);
let t0 = performance.now();
await b.page.keyboard.press('Enter');
unread.deviceOneMarkedMs = await until(a.page, t0, async () => (await label(a.page))?.includes('1 mention') ?? false);
unread.deviceTwoMarkedMs = await until(a2.page, t0, async () => (await label(a2.page))?.includes('1 mention') ?? false);
unread.deviceTwoLabel = await label(a2.page);
await a.page.bringToFront();
t0 = performance.now();
await a.page.locator('.channel', { hasText: 'botti' }).first().click();
unread.deviceTwoClearedMs = await until(a2.page, t0, async () => (await label(a2.page)) === 'botti');
unread.deviceTwoLabelAfter = await label(a2.page);

console.log(JSON.stringify({
  runs: RUNS,
  deliveryMs: Object.fromEntries(Object.entries(times).map(([k, v]) => [k, { ...summary(v), all: v }])),
  unread,
  problems: { a: a.problems, b: b.problems, a2: a2.problems },
}, null, 2));
await browser.close();
