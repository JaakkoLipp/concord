/**
 * Voice in our client (m4-plan.md tasks 3 and 4), on the local dev stack: `dev` and `aino` join the seeded Pelaamo
 * in two browsers, with a speech-like fake microphone (media.ts). Checks:
 * - each sees both in the sidebar under Pelaamo, with the channel's timer, and RNNoise loads under the CSP,
 * - each sees the other's speaking ring,
 * - the mic test during a call shows the call's own microphone,
 * - with aino's threshold above her level her gate shuts: next to no audio leaves, and her ring goes; below it
 *   again both come back,
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
import { fakeMediaArgs } from './media.ts';

// Joins calls as seeded personas: never against production.
await assertDevStack();
const st = loadState()!;
const out = process.argv[2];
const failures: string[] = [];
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failures.push(what); };
const passes = (p: Promise<unknown>) => p.then(() => true, () => false);

const browser: Browser = await chromium.launch({
  headless: true,
  args: [...fakeMediaArgs(), '--autoplay-policy=no-user-gesture-required'],
});

interface Seat { page: Page; joins: number; problems: ReturnType<typeof watch>; rnnoise: string[] }
let seatCount = 0;
/** Voice settings stored on the device before the client starts (apps/web/src/lib/voice/settings.ts). */
async function seat(handle: string, voice?: Record<string, unknown>): Promise<Seat> {
  const seatNo = seatCount++;
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, permissions: ['microphone'] });
  if (voice) await context.addInitScript((v) => localStorage.setItem('concord:voice', JSON.stringify({ settings: v })), voice);
  // Every peer connection, for the bytes the microphone sends.
  await context.addInitScript(() => {
    const Original = window.RTCPeerConnection;
    const all: RTCPeerConnection[] = ((window as unknown as { __pcs: RTCPeerConnection[] }).__pcs = []);
    window.RTCPeerConnection = function (...args: ConstructorParameters<typeof RTCPeerConnection>) {
      const pc = new Original(...args);
      all.push(pc);
      return pc;
    } as unknown as typeof RTCPeerConnection;
    window.RTCPeerConnection.prototype = Original.prototype;
  });
  const page = await context.newPage();
  const s: Seat = { page, joins: 0, problems: watch(page), rnnoise: [] };
  page.on('response', (r) => { if (/rnnoise.*\.wasm/.test(r.url())) s.rnnoise.push(String(r.status())); });
  page.on('request', (r: Request) => { if (r.method() === 'POST' && r.url().endsWith('/join_call')) s.joins++; });
  if (process.env.VOICE_LOG) page.on('console', (m) => console.error(`[${handle}${seatNo}] ${m.type()} ${m.text().slice(0, 300)}`));
  await signIn(page, handle);
  await page.goto(`${APP}/channels/${st.serverId}/${st.channels.pelit}`);
  return s;
}
/** The dock and the voice panel: the call view repeats their buttons. */
const dock = (p: Page) => p.getByRole('region', { name: 'Your account' }).or(p.locator('section[aria-label="Voice call"]'));
const list = (p: Page) => p.getByRole('list', { name: 'In Pelaamo' });
const row = (p: Page, name: RegExp) => list(p).getByRole('button', { name });
async function join(s: Seat) {
  await s.page.getByRole('link', { name: /^Pelaamo/ }).click();
  const ok = await passes(s.page.getByText('Voice connected').waitFor({ timeout: 20_000 }));
  if (!ok) {
    const panel = await s.page.locator('section[aria-label="Voice call"]').innerText().catch(() => '(no panel)');
    const toasts = await s.page.getByRole('status').allInnerTexts().catch(() => []);
    throw new Error(`no "Voice connected" in 20 s; panel: ${JSON.stringify(panel)}; status: ${JSON.stringify(toasts)}; join_call: ${s.joins}`);
  }
}
/** Audio bytes this page sends per second, over two seconds. */
async function sending(p: Page): Promise<number> {
  const total = () => p.evaluate(async () => {
    let bytes = 0;
    for (const pc of (window as unknown as { __pcs: RTCPeerConnection[] }).__pcs) {
      if (pc.connectionState === 'closed') continue;
      (await pc.getStats()).forEach((v: { type: string; kind?: string; bytesSent?: number }) => { if (v.type === 'outbound-rtp' && v.kind === 'audio') bytes += v.bytesSent ?? 0; });
    }
    return bytes;
  });
  const before = await total();
  await p.waitForTimeout(2_000);
  return Math.round(((await total()) - before) / 2);
}
const shot = async (p: Page, name: string) => { if (out) await p.screenshot({ path: `${out}/voice-${name}.png` }); };

const seats: Seat[] = [];
try {
  // dev keeps the defaults. aino uses a fixed threshold, so the check can move it.
  const ainoVoice = { autoSensitivity: false, threshold: -70 };
  const [dev, aino] = await Promise.all([seat('dev'), seat('aino', ainoVoice)]);
  seats.push(dev, aino);
  await join(dev);
  await join(aino);
  check(true, 'both join Pelaamo and see "Voice connected"');

  const both = await passes(Promise.all([dev, aino].map((s) => list(s.page).getByRole('listitem').nth(1).waitFor({ timeout: 10_000 }))));
  check(both, 'each sees two people under Pelaamo');
  const timer = await dev.page.locator('.timer').first().textContent().catch(() => null);
  check(!!timer && /\d:\d\d/.test(timer), `the channel shows its timer (${timer ?? 'none'})`);

  check(dev.rnnoise.length > 0 && dev.rnnoise.every((x) => x === '200'), `RNNoise's wasm loads under the CSP (${dev.rnnoise.join(', ') || 'not requested'})`);
  const ring = await passes(Promise.all([row(dev.page, /Aino Virtanen, speaking/).waitFor({ timeout: 15_000 }), row(aino.page, /^Dev, speaking/).waitFor({ timeout: 15_000 })]));
  check(ring, "each sees the other's speaking ring");
  await shot(dev.page, 'joined');

  await dock(aino.page).getByRole('button', { name: 'Mute', exact: true }).click();
  const muted = await passes(row(dev.page, /muted/).first().waitFor({ timeout: 2_000 }));
  check(muted, "aino's mute shows in dev's sidebar within 2 s");
  await dock(aino.page).getByRole('button', { name: 'Unmute', exact: true }).click();

  // The gate (m4-plan.md task 5), measured by what aino sends: Opus with DTX sends a few bytes a second for
  // silence. The ring is checked too, and showed above, so its going is the gate's doing. Settings open over the
  // call, which goes on.
  await dock(aino.page).getByRole('button', { name: 'User settings' }).click();
  await aino.page.getByRole('link', { name: 'Voice and video' }).click();
  await aino.page.getByRole('button', { name: 'Test microphone' }).click();
  const meter = aino.page.getByRole('meter', { name: 'Microphone level' });
  const moved = await passes(aino.page.waitForFunction((el) => Number(el?.getAttribute('aria-valuenow')) > -60, await meter.elementHandle(), { timeout: 5_000 }));
  check(moved, "the mic test meter moves, showing the call's own microphone");
  await aino.page.getByRole('button', { name: 'Stop testing' }).click();
  const open = await sending(aino.page);
  const slider = aino.page.getByRole('slider', { name: /^Input sensitivity/ });
  await slider.focus();
  await slider.press('End');
  await dev.page.waitForTimeout(1_500);
  const shut = await sending(aino.page);
  let quiet = true;
  for (let t = 0; t < 16 && quiet; t++) {
    quiet = (await row(dev.page, /Aino Virtanen, speaking/).count()) === 0;
    await dev.page.waitForTimeout(250);
  }
  check(shut < open / 10 && quiet, `with aino's threshold at 0 dBFS her gate shuts: ${open} B/s sent, then ${shut} B/s, and no ring for 4 s`);
  await slider.press('Home');
  const reopened = await sending(aino.page);
  const back = await passes(row(dev.page, /Aino Virtanen, speaking/).waitFor({ timeout: 10_000 }));
  check(reopened > open / 2 && back, `below her level again it opens: ${reopened} B/s, and her ring returns`);
  await aino.page.keyboard.press('Escape');

  const aino2 = await seat('aino', ainoVoice);
  seats.push(aino2);
  await join(aino2);
  const elsewhere = await passes(aino.page.getByText('Joined from another device').waitFor({ timeout: 10_000 }));
  check(elsewhere, 'a second browser for aino ends the first call with "Joined from another device"');
  await aino.page.waitForTimeout(12_000);
  check(aino.joins === 1 && aino2.joins === 1, `one join_call each, no loop (first ${aino.joins}, second ${aino2.joins})`);
  await shot(aino.page, 'elsewhere');

  await aino2.page.locator('section[aria-label="Voice call"]').getByRole('button', { name: 'Disconnect' }).click();
  await dev.page.locator('section[aria-label="Voice call"]').getByRole('button', { name: 'Disconnect' }).click();
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
