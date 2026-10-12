/**
 * M1 task 7 check on the live deployment: `dev` keeps the server open in the browser while `lotta`, who is
 * not dev's friend, comes online and changes status over the API. With Subscribe on 0.15.5, the member list
 * must show the change without a reload. Also screenshots the profile popout and the DM profile panel.
 * `node tools/live/src/presence.ts <out-dir>`
 */
import { join } from 'node:path';
import { loadState } from '../../seed/src/config.ts';
import { api } from '../../seed/src/http.ts';
import { login, passwordFor } from '../../seed/src/seed.ts';
import { APP, launch, watch } from './browser.ts';
import { signIn } from './login.ts';

const out = process.argv[2] ?? '.';
const st = loadState()!;
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const problems = watch(page);
await signIn(page, 'dev');
await page.goto(`${APP}/channels/${st.serverId}/${st.channels.yleinen}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

// lotta comes online with a socket of her own, then sets a status text.
const lotta = await login(st.personas.lotta!.email, passwordFor('lotta'));
const ws = new WebSocket('wss://concord.jaalip.com/ws?version=1&format=json');
await new Promise<void>((resolve) => { ws.onopen = () => { ws.send(JSON.stringify({ type: 'Authenticate', token: lotta.token })); resolve(); }; });
const text = `Tilaustesti ${Date.now() % 10000}`;
await page.waitForTimeout(3000);
const onlineSeen = await page.locator('aside[aria-label=Members]').getByText('Lotta Saarinen').evaluate((el) => !el.closest('li')?.classList.contains('offline'));
await api('PATCH', '/users/@me', { auth: { session: lotta.token }, body: { status: { text, presence: 'Busy' } } });
let statusSeen = false;
try {
  await page.locator('aside[aria-label=Members]').getByText(text).waitFor({ timeout: 8000 });
  statusSeen = true;
} catch { /* reported below */ }
await page.screenshot({ path: join(out, 'members-live.png') });

// Popout from the member list.
await page.locator('aside[aria-label=Members]').getByRole('button', { name: /Aino Virtanen/ }).click();
await page.waitForTimeout(1500);
await page.screenshot({ path: join(out, 'popout.png') });
await page.keyboard.press('Escape');

// DM profile panel.
await page.goto(`${APP}/channels/@me/${st.channels['dm-aino']}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.screenshot({ path: join(out, 'dm-panel.png') });

await api('PATCH', '/users/@me', { auth: { session: lotta.token }, body: { status: { presence: 'Online' }, remove: ['StatusText'] } }).catch(() => {});
ws.close();
console.log(JSON.stringify({ onlineSeen, statusSeen, ...problems }, null, 2));
await browser.close();
