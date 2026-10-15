/**
 * m4.5-plan.md task 3 on the local stack: `dev` signed in on two devices, both on the Friends screen. `aino`
 * writes in two of the seeded server's channels, mentioning `dev` once. Both devices show the server unread with a
 * mention, and the tab's title counts it. Device A marks the server read from the server icon's menu, and device
 * B clears within a few seconds, title included.
 * `node tools/live/src/server-read.ts`
 */
import type { Page } from 'playwright-core';
import { loadState } from '../../seed/src/config.ts';
import { APP, launch, watch } from './browser.ts';
import { signIn } from './login.ts';
import { person, until } from './people.ts';

const st = loadState()!;
let failed = 0;
function check(ok: boolean, what: string, detail = ''): void {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ` -> ${detail}` : ''}`);
}

const [aino, dev] = await Promise.all(['aino', 'dev'].map(person));
// Start from a read server, with nothing waiting elsewhere that the title would count.
await dev!.call('PUT', `/servers/${st.serverId}/ack`);

const browser = await launch();
async function device() {
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const problems = watch(page);
  await signIn(page, 'dev');
  await page.goto(`${APP}/channels/@me`, { waitUntil: 'networkidle' });
  return { page, problems };
}
const a = await device();
const b = await device();
const icon = (page: Page) => page.locator('nav[aria-label="Servers"] a.item').filter({ has: page.locator(`[href*="${st.serverId}"]`) }).or(page.locator(`nav[aria-label="Servers"] a.item[href*="${st.serverId}"]`)).first();
const state = async (page: Page) => ({ unread: await icon(page).evaluate((e) => e.classList.contains('unread')), label: await icon(page).getAttribute('aria-label'), title: await page.title() });

const before = await state(b.page);
const tag = Date.now().toString(36);
// Marked read within Stoat's 5 to 8 s lag in recording a channel's newest message, the case that needs care.
const latest: Record<string, string> = {
  [st.channels.offtopic!]: (await aino!.call<{ _id: string }>('POST', `/channels/${st.channels.offtopic}/messages`, { content: `luettu-testi ${tag}` }))._id,
  [st.channels.botti!]: (await aino!.call<{ _id: string }>('POST', `/channels/${st.channels.botti}/messages`, { content: `<@${dev!.id}> luettu-testi ${tag}` }))._id,
};
const shown = await until(async () => (await state(b.page)).unread && (await state(a.page)).unread, 10_000).then(() => true, () => false);
const during = await state(b.page);
check(shown, 'both devices show the server unread', JSON.stringify(during));
const count = (title: string) => Number(/^\((\d+)\)/.exec(title)?.[1] ?? 0);
check(count(during.title) === count(before.title) + 1, 'the title counts the mention', `${before.title} -> ${during.title}`);

await icon(a.page).click({ button: 'right' });
await a.page.getByRole('menuitem', { name: 'Mark as read', exact: true }).click();
const start = Date.now();
const cleared = await until(async () => !(await state(b.page)).unread && count((await state(b.page)).title) === count(before.title), 10_000).then(() => true, () => false);
const after = await state(b.page);
check(cleared, `the other device clears, title included, in ${Date.now() - start} ms`, JSON.stringify(after));
check(!(await state(a.page)).unread, 'this device clears at once');
const acked = await until(async () => {
  const u = await dev!.call<{ _id: { channel: string }; last_id?: string }[]>('GET', '/sync/unreads');
  return [st.channels.offtopic, st.channels.botti].every((c) => (u.find((x) => x._id.channel === c)?.last_id ?? '') >= latest[c!]!);
}, 5_000).then(() => true, () => false);
check(acked, 'Stoat has both channels read up to the new messages, sent seconds before');
await icon(a.page).click({ button: 'right' });
check(await a.page.getByRole('menuitem', { name: 'Mark as read', exact: true }).count() === 0, 'a read server doesn’t offer Mark as read');
await a.page.keyboard.press('Escape');

check([...a.problems.console, ...b.problems.console].length === 0, 'no console errors', [...a.problems.console, ...b.problems.console].slice(0, 3).join(' | '));
await browser.close();
console.log(failed ? `server-read: ${failed} failed` : 'server-read: all passed');
process.exit(failed ? 1 : 0);
