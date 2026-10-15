/**
 * Favourite GIFs (m4.5 follow-up) on the local stack: no search, no GIF service. `aino` posts a GIF linked straight
 * in #botti, and `dev`, on two devices:
 * - stars it in chat, and the context menu then offers to remove it,
 * - finds it in the composer's GIF picker on both devices, synced through Stoat's settings,
 * - sends it from the picker, which posts its link, and the message plays as a GIF,
 * - removes it on one device, and the other's picker empties.
 * dev's favourites are cleared before and after.
 * `node tools/live/src/gifs.ts [screenshot-dir]`
 */
import { join } from 'node:path';
import type { Page } from 'playwright-core';
import { loadState } from '../../seed/src/config.ts';
import { APP, launch, watch } from './browser.ts';
import { signIn } from './login.ts';
import { person, until } from './people.ts';

const st = loadState()!;
const out = process.argv[2];
const channel = st.channels.botti!;
const GIF = 'https://media.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif';
let failed = 0;
function check(ok: boolean, what: string, detail = ''): void {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ` -> ${detail}` : ''}`);
}
const shows = (p: Promise<unknown>) => p.then(() => true, () => false);

const [aino, dev] = await Promise.all(['aino', 'dev'].map(person));
const clear = () => dev!.call('POST', `/sync/settings/set?timestamp=${Date.now()}`, { 'concord:gifs': '[]' });
await clear();
const posted = await aino!.call<{ _id: string }>('POST', `/channels/${channel}/messages`, { content: GIF });

const browser = await launch();
async function device() {
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const problems = watch(page);
  // The message events, kept for the report if the sent GIF doesn't show.
  const frames: string[] = [];
  page.on('websocket', (ws) => ws.on('framereceived', (f) => { const t = String(f.payload); if (/"type":"(Message|MessageAppend|MessageUpdate)"/.test(t) && t.includes('giphy')) frames.push(t.slice(0, 60)); }));
  await signIn(page, 'dev');
  await page.goto(`${APP}/channels/${st.serverId}/${channel}`, { waitUntil: 'networkidle' });
  await page.locator('.composer .cm-content').waitFor();
  return { page, problems, frames };
}
const picker = (p: Page) => p.getByRole('dialog', { name: 'Favourite GIFs' });
async function openPicker(p: Page) {
  // A picker that was just closed fades out for a moment: wait until it has, rather than take it for open.
  await picker(p).waitFor({ state: 'hidden', timeout: 2_000 }).catch(() => {});
  if (await picker(p).isVisible()) return;
  await p.getByRole('button', { name: 'GIFs', exact: true }).click();
  await picker(p).waitFor({ timeout: 5_000 });
}

try {
  const a = await device();
  const message = a.page.locator(`#message-${posted._id}`);
  await message.locator('img[data-original]').waitFor({ timeout: 20_000 });

  await openPicker(a.page);
  check(await shows(picker(a.page).getByText(/Star a GIF in chat/).waitFor({ timeout: 3_000 })), 'the picker starts empty, saying how to add one');
  await a.page.keyboard.press('Escape');

  // Star it in chat.
  await message.locator('.has-star').hover();
  await message.getByRole('button', { name: 'Add to favourite GIFs' }).click();
  check(await shows(message.getByRole('button', { name: 'Remove from favourite GIFs' }).waitFor({ timeout: 3_000 })), 'the star in chat adds it');
  await message.locator('img[data-original]').click({ button: 'right' });
  const item = await a.page.getByRole('menu').getByRole('menuitem', { name: 'Remove from favourite GIFs' }).count();
  await a.page.keyboard.press('Escape');
  check(item === 1, 'its context menu offers to remove it');

  await openPicker(a.page);
  const tiles = picker(a.page).getByRole('button', { name: 'Send this GIF' });
  check(await tiles.count() === 1, 'the picker shows it');
  if (out) await a.page.screenshot({ path: join(out, 'gif-picker.png') });

  // Another device gets it from Stoat's settings, once the 2 s save has gone out.
  await a.page.waitForTimeout(3_000);
  const b = await device();
  await openPicker(b.page);
  check(await shows(picker(b.page).getByRole('button', { name: 'Send this GIF' }).first().waitFor({ timeout: 5_000 })), 'another device has it too');

  // Send it from the picker.
  await tiles.first().click();
  let sentId = '';
  const sent = await until(async () => {
    const [last] = await dev!.call<{ _id: string; content?: string; author: string }[]>('GET', `/channels/${channel}/messages?limit=1`);
    sentId = last?._id ?? '';
    return last?.author === dev!.id && last.content === GIF;
  }, 8_000).then(() => true, () => false);
  check(sent, 'picking it sends its link');
  const plays = await shows(a.page.locator(`#message-${sentId} img[data-original]`).waitFor({ timeout: 20_000 }));
  if (!plays && out) await a.page.screenshot({ path: join(out, 'gif-sent.png') });
  if (!plays) console.log('     not shown:', JSON.stringify({ sentId, last: await a.page.locator('article.message').evaluateAll((els) => els.slice(-3).map((e) => `${e.id} img:${e.querySelectorAll('img[data-original]').length} embeds:${e.querySelectorAll('.media, .card').length}`)), jump: await a.page.getByText('Jump to present').count(), frames: a.frames }));
  check(plays, 'and the message shows the GIF');

  // Removed on device B, gone on device A.
  await picker(b.page).getByRole('button', { name: 'Remove from favourite GIFs' }).first().click({ force: true });
  await openPicker(a.page);
  const emptied = await shows(picker(a.page).getByText(/Star a GIF in chat/).waitFor({ timeout: 10_000 }));
  if (!emptied) console.log('     not emptied: A open', await picker(a.page).isVisible(), 'A tiles', await picker(a.page).getByRole('button', { name: 'Send this GIF' }).count(), 'B tiles', await picker(b.page).getByRole('button', { name: 'Send this GIF' }).count(), 'B picker open', await picker(b.page).isVisible(),
    'stored', (await dev!.call<Record<string, [number, string]>>('POST', '/sync/settings/fetch', { keys: ['concord:gifs'] }))['concord:gifs']?.[1]?.slice(0, 60));
  check(emptied, 'removing it on one device empties the other’s picker');

  const problems = [...a.problems.console, ...b.problems.console];
  check(problems.length === 0, 'no console errors', problems.slice(0, 3).join(' | '));
} catch (e) {
  failed++;
  console.log(`FAIL ${String(e).split('\n')[0]}`);
} finally {
  await clear().catch(() => {});
  await browser.close();
}
console.log(failed ? `gifs: ${failed} failed` : 'gifs: all passed');
process.exit(failed ? 1 : 0);
