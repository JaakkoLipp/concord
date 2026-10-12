/**
 * M2a task 2 on the live deployment: `node tools/live/src/send.ts`.
 * - `dev` sends in #botti through the composer, and `aino` sees it. Measures the delay.
 * - `dev` on a second "device" sees #botti's unread marker clear when the first one reads it.
 * - A send while offline fails as retry-safe, and Retry delivers it exactly once.
 * - Opening #tekniikka clears its stuck unread state at Stoat.
 */
import type { Page } from 'playwright-core';
import { loadState } from '../../seed/src/config.ts';
import { api } from '../../seed/src/http.ts';
import { login, passwordFor } from '../../seed/src/seed.ts';
import { APP, launch, watch } from './browser.ts';
import { signIn } from './login.ts';

const st = loadState()!;
const url = (key: string) => `${APP}/channels/${st.serverId}/${st.channels[key]}`;
const browser = await launch();
const open = async (handle: string, key: string) => {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  const problems = watch(page);
  await signIn(page, handle);
  await page.goto(url(key), { waitUntil: 'networkidle' });
  await page.getByText('Connected').waitFor({ timeout: 15_000 }).catch(() => {});
  await page.locator('.composer .cm-content').waitFor();
  return { page, context, problems };
};
const send = async (page: Page, text: string) => {
  await page.locator('.composer .cm-content').click();
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
};
const unread = (page: Page, name: string) => page.locator('.channel', { hasText: name }).first().evaluate((el) => el.classList.contains('unread'));
const results: Record<string, unknown> = {};

const a = await open('dev', 'botti');
const b = await open('aino', 'botti');
const a2 = await open('dev', 'pelit');
await a.page.bringToFront();

// 1. Send and delivery.
const tag = Date.now().toString(36);
const first = `m2a lähetys ${tag}`;
const t0 = Date.now();
await send(a.page, first);
await b.page.getByText(first).waitFor({ timeout: 10_000 });
results.deliveryMs = Date.now() - t0;
await a.page.waitForTimeout(1500);
results.copiesForSender = await a.page.getByText(first).count();
results.stillPending = await a.page.locator('.message.sending, .message.failed').count();

// 2. Unread on the second device: aino posts, the first device reads it, the second device's marker clears.
const second = `m2a lukukuittaus ${tag}`;
await send(b.page, second);
await a2.page.locator('.channel.unread', { hasText: 'botti' }).waitFor({ timeout: 10_000 }).then(() => (results.secondDeviceSawUnread = true)).catch(() => (results.secondDeviceSawUnread = false));
const t1 = Date.now();
await a.page.getByText(second).waitFor({ timeout: 10_000 });
await a.page.locator('.channel.unread', { hasText: 'botti' }).waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
results.firstDeviceRead = !(await unread(a.page, 'botti'));
results.secondDeviceCleared = await a2.page.locator('.channel.unread', { hasText: 'botti' }).waitFor({ state: 'detached', timeout: 10_000 })
  .then(() => `${Date.now() - t1} ms`).catch(() => 'no');

// 3. Offline send, then Retry.
const third = `m2a offline ${tag}`;
await a.context.setOffline(true);
await send(a.page, third);
await a.page.locator('.message.failed').waitFor({ timeout: 25_000 });
results.offlineFailure = await a.page.locator('.not-sent').innerText();
await a.context.setOffline(false);
await a.page.getByText('Connected').waitFor({ timeout: 30_000 }).catch(() => {});
await a.page.locator('.not-sent button', { hasText: 'Retry' }).click();
await b.page.getByText(third).waitFor({ timeout: 10_000 });
await a.page.waitForTimeout(1500);
results.offlineCopiesForSender = await a.page.getByText(third).count();
results.offlineCopiesForOther = await b.page.getByText(third).count();

// 4. #tekniikka, left unread by the planning probe, is read once opened.
await a2.page.bringToFront();
await a2.page.goto(url('tekniikka'), { waitUntil: 'networkidle' });
await a2.page.waitForTimeout(6000);
const dev = { session: (await login(st.personas.dev!.email, passwordFor('dev'))).token };
const ch = await api<{ last_message_id?: string }>('GET', `/channels/${st.channels.tekniikka}`, { auth: dev });
const unreads = await api<{ _id: { channel: string }; last_id?: string }[]>('GET', '/sync/unreads', { auth: dev });
results.tekniikkaReadAtStoat = unreads.find((u) => u._id.channel === st.channels.tekniikka)?.last_id === ch.last_message_id;

await a.page.screenshot({ path: process.argv[2] ?? 'send.png' });
console.log(JSON.stringify({ ...results, problems: { a: a.problems, b: b.problems, a2: a2.problems } }, null, 2));
await browser.close();
