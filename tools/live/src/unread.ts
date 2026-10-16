/**
 * M4.8 task 4, local stack only: 150 unread messages open at the first, stay unread, and clear
 * only on reaching the bottom. A short run has an exact count; Esc and the bar also mark read.
 * Uses a temporary channel, removed at the end. CONCORD_APP may point at an isolated Vite server.
 */
import assert from 'node:assert/strict';
import { ADMIN } from '../../seed/src/data.ts';
import { loadState } from '../../seed/src/config.ts';
import { APP, launch, watch } from './browser.ts';
import { signIn } from './login.ts';
import { person, until } from './people.ts';

const st = loadState()!;
const count = Number(process.env.UNREAD_MESSAGES ?? 150);
const [admin, aino, dev] = await Promise.all([person(ADMIN), person('aino'), person('dev')]);
const channel = await admin.call<{ _id: string }>('POST', `/servers/${st.serverId}/channels`, { type: 'Text', name: 'm48-unread-check' });
const path = `/channels/${channel._id}`;
const url = `${APP}/channels/${st.serverId}/${channel._id}`;
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
const problems = watch(page);
const acks: string[] = [];
page.on('request', (r) => { if (r.method() === 'PUT' && r.url().includes(`${path}/ack/`)) acks.push(r.url()); });
try {
  const baseline = await aino.call<{ _id: string }>('POST', `${path}/messages`, { content: 'Read boundary' });
  await dev.call('PUT', `${path}/ack/${baseline._id}`);
  await page.waitForTimeout(9_000);
  await signIn(page, 'dev');
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator(`#message-${baseline._id}`).waitFor();
  await page.locator('.scroller').focus();
  await page.keyboard.press('Escape');
  await until(async () => await page.locator('.unread-bar').count() === 0);
  await page.goto(`${APP}/channels/@me`, { waitUntil: 'networkidle' });
  const sent: string[] = [];
  for (let n = 1; n <= count; n++) {
    const msg = await aino.call<{ _id: string }>('POST', `${path}/messages`, { content: `Unread ${n} of ${count}` });
    sent.push(msg._id);
    if (n % 50 === 0) console.log(`prepared ${n}/150 unread messages`);
  }
  await page.waitForTimeout(9_000); // Stoat persists last_message_id 5 to 8 seconds after a post.
  acks.length = 0;
  await page.goto(url, { waitUntil: 'networkidle' });
  const first = page.locator(`#message-${sent[0]}`);
  await first.waitFor().catch(async (error: unknown) => {
    console.log('debug', { url: page.url(), problems, ids: await page.locator('article.message').evaluateAll((els) => els.map((e) => e.getAttribute('data-id'))), bar: await page.locator('.unread-bar').allTextContents() });
    throw error;
  });
  await page.waitForTimeout(700);
  assert(await first.evaluate((el) => {
    const row = el.getBoundingClientRect();
    const box = document.querySelector('.scroller')!.getBoundingClientRect();
    return row.top >= box.top - 1 && row.top < box.bottom;
  }), 'the first unread message is at the top');
  assert.match(await page.locator('.unread-bar').innerText(), count > 100 ? /New messages since/ : new RegExp(`${count} new messages since`));
  assert.equal(acks.length, 0, 'opening does not acknowledge');
  assert(await page.locator(`a[href$="/${channel._id}"]`).first().evaluate((el) => el.classList.contains('unread')), 'the sidebar remains unread');
  console.log(`ok: first of ${count} visible, correct label, no ack, sidebar unread`);

  const scroller = page.locator('.scroller');
  if (await scroller.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight < 8)) {
    await page.locator('.unread-jump').click();
  }
  await until(async () => {
    await scroller.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    return await page.locator('.unread-bar').count() === 0;
  }, 20_000);
  assert(acks.length > 0, 'bottom acknowledges');
  assert(await page.locator(`#message-${sent.at(-1)}`).count() > 0, 'bottom reaches message 150');
  console.log(`ok: reaching the bottom acknowledges all ${count}`);

  // Use a small, complete cached run for the exact count and explicit controls.
  await page.goto(`${APP}/channels/@me`, { waitUntil: 'networkidle' });
  for (let n = 0; n < 3; n++) await aino.call('POST', `${path}/messages`, { content: `Short unread ${n}` });
  await page.waitForTimeout(9_000); // Stoat persists last_message_id 5 to 8 seconds after a post.
  acks.length = 0;
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('.unread-bar').waitFor();
  assert.match(await page.locator('.unread-bar').innerText(), /3 new messages since/);
  assert.equal(acks.length, 0);
  await page.locator('.unread-bar').getByRole('button', { name: 'Mark as read', exact: true }).click();
  await until(async () => await page.locator('.unread-bar').count() === 0);
  assert.equal(await page.locator('.divider.new').count(), 1, 'reading keeps the divider fixed');
  console.log('ok: exact short count, Mark as read, fixed divider');

  await page.goto(`${APP}/channels/@me`, { waitUntil: 'networkidle' });
  await aino.call('POST', `${path}/messages`, { content: 'Escape unread' });
  await page.waitForTimeout(9_000);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('.unread-bar').waitFor();
  await page.locator('.scroller').focus();
  await page.keyboard.press('Escape');
  await until(async () => await page.locator('.unread-bar').count() === 0);
  console.log('ok: Esc marks read');

  await page.locator('article.message').last().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Mark unread', exact: true }).click();
  await page.locator('.unread-bar').waitFor();
  const heldAcks = acks.length;
  await scroller.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await page.waitForTimeout(500);
  assert.equal(await page.locator('.unread-bar').count(), 1, 'held Mark unread wins over the bottom');
  assert.equal(acks.length, heldAcks, 'a held unread is not automatically acknowledged again');
  await page.locator('.unread-jump').click();
  await until(async () => await page.locator('.unread-bar').count() === 0);
  console.log('ok: held Mark unread stays unread; the bar jumps to newest and reads');

  assert.deepEqual(problems.console, [], 'no console errors');
} catch (error) {
  const meta = await dev.call<{ last_message_id?: string }>('GET', path).catch(() => null);
  const unreads = await dev.call<{ _id: { channel: string }; last_id?: string }[]>('GET', '/sync/unreads').catch(() => []);
  console.log('unread diagnostics', {
    newest: meta?.last_message_id,
    readAt: unreads.find((u) => u._id.channel === channel._id)?.last_id,
    acks, bar: await page.locator('.unread-bar').allTextContents(),
    sidebar: await page.locator(`a[href$="/${channel._id}"]`).first().getAttribute('class'),
    problems,
  });
  throw error;
} finally {
  await browser.close();
  await admin.call('DELETE', path);
}
console.log('unread: all passed');
