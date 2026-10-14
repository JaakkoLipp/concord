/**
 * Voice in our client (m4-plan.md tasks 3 and 4), on the local dev stack: `dev` and `aino` join the seeded Pelaamo
 * in two browsers with Chromium's fake microphone, which beeps. Checks:
 * - each sees both in the sidebar under Pelaamo, with the channel's timer,
 * - each sees the other's speaking ring,
 * - a mute shows in the other's sidebar within 2 s,
 * - a second browser for `aino` ends the first one's call with "Joined from another device", one join_call each,
 * - leaving clears the sidebar.
 * Usage: node tools/live/src/voice.ts [screenshot-dir]
 */
import type { Browser, Page, Request } from 'playwright-core';
import { chromium } from 'playwright-core';
import { loadState } from '../../seed/src/config.ts';
import { assertDevStack } from '../../seed/src/vps.ts';
import { APP, watch } from './browser.ts';
import { signIn } from './login.ts';

// Joins calls as seeded personas: never against production.
await assertDevStack();
const st = loadState()!;
const out = process.argv[2];
const failures: string[] = [];
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failures.push(what); };
const passes = (p: Promise<unknown>) => p.then(() => true, () => false);

const browser: Browser = await chromium.launch({
  headless: true,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});

interface Seat { page: Page; joins: number; problems: ReturnType<typeof watch> }
let seatCount = 0;
async function seat(handle: string): Promise<Seat> {
  const seatNo = seatCount++;
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, permissions: ['microphone'] });
  const page = await context.newPage();
  const s: Seat = { page, joins: 0, problems: watch(page) };
  page.on('request', (r: Request) => { if (r.method() === 'POST' && r.url().endsWith('/join_call')) s.joins++; });
  if (process.env.VOICE_LOG) page.on('console', (m) => console.error(`[${handle}${seatNo}] ${m.type()} ${m.text().slice(0, 300)}`));
  await signIn(page, handle);
  await page.goto(`${APP}/channels/${st.serverId}/${st.channels.pelit}`);
  return s;
}
const list = (p: Page) => p.getByRole('list', { name: 'In Pelaamo' });
const row = (p: Page, name: RegExp) => list(p).getByRole('button', { name });
async function join(s: Seat) {
  await s.page.getByRole('link', { name: /^Pelaamo/ }).click();
  await s.page.getByText('Voice connected').waitFor({ timeout: 20_000 });
}
const shot = async (p: Page, name: string) => { if (out) await p.screenshot({ path: `${out}/voice-${name}.png` }); };

const seats: Seat[] = [];
try {
  const [dev, aino] = await Promise.all([seat('dev'), seat('aino')]);
  seats.push(dev, aino);
  await join(dev);
  await join(aino);
  check(true, 'both join Pelaamo and see "Voice connected"');

  const both = await passes(Promise.all([dev, aino].map((s) => list(s.page).getByRole('listitem').nth(1).waitFor({ timeout: 5_000 }))));
  check(both, 'each sees two people under Pelaamo');
  const timer = await dev.page.locator('.timer').first().textContent().catch(() => null);
  check(!!timer && /\d:\d\d/.test(timer), `the channel shows its timer (${timer ?? 'none'})`);

  const ring = await passes(Promise.all([dev, aino].map((s) => row(s.page, /speaking/).first().waitFor({ timeout: 15_000 }))));
  check(ring, 'each sees a speaking ring from the fake microphone');
  await shot(dev.page, 'joined');

  await aino.page.getByRole('button', { name: 'Mute', exact: true }).click();
  const muted = await passes(row(dev.page, /muted/).first().waitFor({ timeout: 2_000 }));
  check(muted, "aino's mute shows in dev's sidebar within 2 s");
  await aino.page.getByRole('button', { name: 'Unmute', exact: true }).click();

  const aino2 = await seat('aino');
  seats.push(aino2);
  await join(aino2);
  const elsewhere = await passes(aino.page.getByText('Joined from another device').waitFor({ timeout: 10_000 }));
  check(elsewhere, 'a second browser for aino ends the first call with "Joined from another device"');
  await aino.page.waitForTimeout(12_000);
  check(aino.joins === 1 && aino2.joins === 1, `one join_call each, no loop (first ${aino.joins}, second ${aino2.joins})`);
  await shot(aino.page, 'elsewhere');

  await aino2.page.getByRole('button', { name: 'Disconnect' }).click();
  await dev.page.getByRole('button', { name: 'Disconnect' }).click();
  const empty = await passes(list(dev.page).waitFor({ state: 'detached', timeout: 10_000 }));
  check(empty, 'leaving clears Pelaamo in the sidebar');

  // The call ended from the other device logs LiveKit's own warning while it closes; that one is expected.
  const problems = [dev, aino, aino2].flatMap((s) => [...s.problems.failed, ...s.problems.console])
    .filter((p) => !p.includes('createOffer with closed peer connection'));
  check(problems.length === 0, `no failed requests or console errors${problems.length ? `: ${problems.slice(0, 6).join('; ')}` : ''}`);
} catch (e) {
  failures.push(String(e));
  console.log(`FAIL ${String(e).split('\n')[0]}`);
  for (const [i, s] of seats.entries()) {
    await shot(s.page, `failed-${i}`).catch(() => {});
    console.log(`  seat ${i}: ${[...s.problems.failed, ...s.problems.console].slice(0, 5).join('; ') || 'no problems logged'}`);
  }
} finally {
  await browser.close();
}
console.log(failures.length ? `voice: ${failures.length} failed` : 'voice: all passed');
process.exit(failures.length ? 1 : 0);
