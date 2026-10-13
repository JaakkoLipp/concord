/**
 * M2a task 7 on the live deployment: `node tools/live/src/typing.ts [out.png]`.
 * `dev` types in #botti and `aino` sees the indicator start, stop after a pause, and stop on send.
 * Two people typing at once read as one line. This also verifies the BeginTyping and EndTyping frames.
 */
import type { Page } from 'playwright-core';
import { loadState } from '../../seed/src/config.ts';
import { APP, launch, watch } from './browser.ts';
import { signIn } from './login.ts';

const st = loadState()!;
const browser = await launch();
const open = async (handle: string) => {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  const problems = watch(page);
  await signIn(page, handle);
  await page.goto(`${APP}/channels/${st.serverId}/${st.channels.botti}`, { waitUntil: 'networkidle' });
  await page.locator('.composer .cm-content').waitFor();
  return { page, problems };
};
const line = (page: Page) => page.locator('.typing');
const until = async (page: Page, pred: (t: string) => boolean, timeout = 15_000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (pred(await line(page).innerText())) return Date.now() - t0;
    await page.waitForTimeout(25);
  }
  return -1;
};
const results: Record<string, unknown> = {};

const dev = await open('dev');
const aino = await open('aino');
const lauri = await open('lauri');

await dev.page.locator('.composer .cm-content').click();
await dev.page.keyboard.type('h');
results.startMs = await until(aino.page, (t) => t.includes('Dev is typing'));
await dev.page.keyboard.type('ei kaikille');
results.stopAfterPauseMs = await until(aino.page, (t) => t === '');
await dev.page.keyboard.type(' ja');
await until(aino.page, (t) => t.includes('Dev is typing'));
await dev.page.keyboard.press('Enter');
results.stopOnSendMs = await until(aino.page, (t) => t === '');

for (const p of [aino.page, lauri.page]) {
  await p.locator('.composer .cm-content').click();
  await p.keyboard.type('kirjoitan');
}
results.twoTypers = await dev.page.locator('.typing').innerText().then(async (t) => t || (await dev.page.waitForTimeout(500), dev.page.locator('.typing').innerText()));
await dev.page.screenshot({ path: process.argv[2] ?? 'typing.png' });
for (const p of [aino.page, lauri.page]) for (let i = 0; i < 9; i++) await p.keyboard.press('Backspace');
results.clearedStopsMs = await until(dev.page, (t) => t === '');

console.log(JSON.stringify({ ...results, problems: { dev: dev.problems, aino: aino.problems, lauri: lauri.problems } }, null, 2));
await browser.close();
