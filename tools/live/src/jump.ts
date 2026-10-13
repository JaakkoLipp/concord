/**
 * After a jump to a message, on the live deployment: `node tools/live/src/jump.ts`.
 * `dev` jumps into #botti's history and scrolls to the bottom; a new message from `aino` must not pull
 * the view back to the jumped-to message. Then `dev` jumps again and sends: the list goes to the bottom
 * with the new message in view, and the channel is read at Stoat.
 */
import { loadState } from '../../seed/src/config.ts';
import { api } from '../../seed/src/http.ts';
import { login, passwordFor } from '../../seed/src/seed.ts';
import { APP, launch } from './browser.ts';
import { signIn } from './login.ts';
const st = loadState()!;
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
await signIn(page, 'dev');
await page.goto(`${APP}/channels/${st.serverId}/${st.channels.botti}`, { waitUntil: 'networkidle' });
const aino = { session: (await login(st.personas.aino!.email, passwordFor('aino'))).token };
const ids = (await api<{ _id: string }[]>('GET', `/channels/${st.channels.botti}/messages?limit=30`, { auth: aino })).map((m) => m._id);
const target = ids[20]!;
await page.goto(`${APP}/channels/${st.serverId}/${st.channels.botti}/${target}`, { waitUntil: 'networkidle' });
await page.locator(`#message-${target}`).waitFor();
await page.waitForTimeout(1000);
const scroller = page.locator('.scroller');
await scroller.evaluate((el) => (el.scrollTop = el.scrollHeight));
await page.waitForTimeout(500);
const before = await scroller.evaluate((el) => [el.scrollTop, el.scrollHeight - el.clientHeight]);
await api('POST', `/channels/${st.channels.botti}/messages`, { auth: aino, body: { content: `hyppytesti ${Date.now().toString(36)}` } });
await page.waitForTimeout(1500);
const after = await scroller.evaluate((el) => [el.scrollTop, el.scrollHeight - el.clientHeight]);
// Then jump again, scroll up a little, and send: the list should go to the bottom with the new message in view.
const acks: string[] = [];
page.on('request', (r) => { if (r.method() === 'PUT' && r.url().includes('/ack/')) acks.push(r.url().split('/').at(-1)!); });
await page.goto(`${APP}/channels/${st.serverId}/${st.channels.botti}/${target}`, { waitUntil: 'networkidle' });
await page.locator(`#message-${target}`).waitFor();
await page.waitForTimeout(800);
const text = `hyppylähetys ${Date.now().toString(36)}`;
await page.locator('.composer .cm-content').click();
await page.keyboard.type(text);
await page.keyboard.press('Enter');
await page.getByText(text).waitFor();
await page.waitForTimeout(1500);
const sent = await page.getByText(text).evaluate((el) => { const r = el.getBoundingClientRect(); const s = document.querySelector('.scroller')!.getBoundingClientRect(); return r.bottom <= s.bottom + 1 && r.top >= s.top; });
const end = await scroller.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight);
// Stoat applies acks a few seconds late: poll for up to 15 s.
const dev = { session: (await login(st.personas.dev!.email, passwordFor('dev'))).token };
const sentAt = performance.now();
let readAtStoat = -1;
while (performance.now() - sentAt < 15_000) {
  const ch = await api<{ last_message_id?: string }>('GET', `/channels/${st.channels.botti}`, { auth: dev });
  const unread = await api<{ _id: { channel: string }; last_id?: string }[]>('GET', '/sync/unreads', { auth: dev });
  if (unread.find((u) => u._id.channel === st.channels.botti)?.last_id === ch.last_message_id) { readAtStoat = Math.round(performance.now() - sentAt); break; }
  await page.waitForTimeout(500);
}
console.log(JSON.stringify({ acksSent: acks, stayedAtBottom: after[0] === after[1], before, after, sentVisible: sent, distanceFromBottom: end, readAtStoat }));
await browser.close();
