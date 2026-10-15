/**
 * Screen share (m4-plan.md task 7), on the local dev stack: `ben` shares a fake 1080p screen with moving content
 * into Olohuone, and `eetu` watches it. Only two browsers, so a headless software encoder isn't starved of CPU.
 * Checks, read from the viewer's stats overlay:
 * - the share reaches the viewer at 1920 x 1080, and at what frame rate,
 * - it arrives as H.264, so a silent fall-back to VP8 fails. If this Chromium can't send H.264 at all, that is
 *   reported as unverifiable instead,
 * - throttled with `tc tbf` at 1.5 Mbit/s in LiveKit's network namespace, the viewer drops to a lower layer while
 *   frames keep arriving, and 1080p comes back once the throttle is lifted. The throttle shapes what LiveKit sends,
 *   so the viewer's downlink rather than the sharer's upload, and every client of the local LiveKit at once: it
 *   stays on for as short a time as the check allows, and is always removed.
 * Review screenshots: the share dialog, the viewer's and the sharer's overlays, and the viewer while throttled.
 * Usage: node tools/live/src/share.ts [screenshot-dir]
 */
import { execFileSync } from 'node:child_process';
import type { Browser, Page } from 'playwright-core';
import { chromium } from 'playwright-core';
import { loadState } from '../../seed/src/config.ts';
import { assertDevStack } from '../../seed/src/vps.ts';
import { APP, watch } from './browser.ts';
import { signIn } from './login.ts';

// Shapes the local LiveKit's network: never against production.
await assertDevStack();
const st = loadState()!;
const out = process.argv[2];
const failures: string[] = [];
const notes: string[] = [];
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failures.push(what); };

/** Runs a command in LiveKit's network namespace (m4-results.md, task 2). */
function inLivekit(cmd: string): string {
  return execFileSync('docker', ['run', '--rm', '--cap-add', 'NET_ADMIN', '--network', 'container:stoat-livekit-1', 'nicolaka/netshoot:v0.14', 'sh', '-c', cmd], { encoding: 'utf8' });
}
const unthrottle = () => { try { inLivekit('tc qdisc del dev eth0 root 2>/dev/null; true'); } catch { /* nothing to remove */ } };
process.on('SIGINT', () => { unthrottle(); process.exit(130); });

const browser: Browser = await chromium.launch({
  headless: true,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});

/**
 * The sharer's screen: a 1920 x 1080 canvas at 60 fps with moving content, in place of the browser's picker. The
 * app's own dialog, fitting and publishing still run on it.
 */
const FAKE_SCREEN = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 1920;
  canvas.height = 1080;
  const g = canvas.getContext('2d')!;
  let n = 0;
  const draw = () => {
    n++;
    const t = n / 60;
    g.fillStyle = `hsl(${(n * 2) % 360} 40% 20%)`;
    g.fillRect(0, 0, 1920, 1080);
    for (let i = 0; i < 24; i++) {
      g.fillStyle = `hsl(${(i * 15 + n) % 360} 70% 55%)`;
      g.fillRect((Math.sin(t * 1.3 + i) * 0.5 + 0.5) * 1700, (Math.cos(t * 0.9 + i * 2) * 0.5 + 0.5) * 900, 220, 180);
    }
    g.fillStyle = '#fff';
    g.font = '96px sans-serif';
    g.fillText(`frame ${n}`, 80, 140);
  };
  setInterval(draw, 1000 / 60);
  navigator.mediaDevices.getDisplayMedia = async () => {
    draw();
    return canvas.captureStream(60);
  };
};

interface Seat { page: Page; problems: ReturnType<typeof watch> }
async function seat(handle: string, scale: number, fakeScreen: boolean): Promise<Seat> {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: scale, permissions: ['microphone', 'camera'] });
  if (fakeScreen) await context.addInitScript(FAKE_SCREEN);
  const page = await context.newPage();
  const s: Seat = { page, problems: watch(page) };
  if (process.env.VOICE_LOG) page.on('console', (msg) => console.error(`[${handle}] ${msg.type()} ${msg.text().slice(0, 300)}`));
  await signIn(page, handle);
  return s;
}
const shot = async (p: Page, name: string) => { if (out) await p.screenshot({ path: `${out}/share-${name}.png` }); };
const call = (p: Page) => p.getByRole('region', { name: 'Call in Olohuone' });
async function join(s: Seat) {
  await s.page.goto(`${APP}/channels/${st.serverId}/${st.channels.yleinen}`);
  await s.page.getByRole('link', { name: /^Olohuone/ }).click();
  await s.page.getByText('Voice connected').waitFor({ timeout: 20_000 });
}
const screenTile = (p: Page) => call(p).getByRole('button', { name: /^Ben Carter’s screen/ });
/** Turns the stats overlay on from a screen tile's menu. */
async function overlayOn(p: Page) {
  await screenTile(p).click({ button: 'right' });
  const item = p.getByRole('menu').getByRole('menuitemcheckbox', { name: 'Stats overlay' });
  if ((await item.getAttribute('aria-checked')) !== 'true') await item.click();
  else await p.keyboard.press('Escape');
}

interface View { width: number; height: number; fps: number; codec: string; layer: string; kbps: number }
async function view(p: Page): Promise<View | null> {
  return p.locator('dl[data-role="viewer"]').first().evaluate((el: HTMLElement) => ({
    width: Number(el.dataset.width), height: Number(el.dataset.height), fps: Number(el.dataset.fps),
    codec: el.dataset.codec ?? '', layer: el.dataset.layer ?? '', kbps: Number(el.dataset.kbps),
  })).catch(() => null);
}
/** Samples the viewer's overlay every second until `done` says so or the time runs out. */
async function until(p: Page, ms: number, done: (v: View, all: View[]) => boolean): Promise<{ ok: boolean; samples: View[] }> {
  const samples: View[] = [];
  for (const end = Date.now() + ms; Date.now() < end;) {
    const v = await view(p);
    if (v) {
      samples.push(v);
      if (done(v, samples)) return { ok: true, samples };
    }
    await p.waitForTimeout(1000);
  }
  return { ok: false, samples };
}
const fmt = (v: View | undefined) => (v ? `${v.width}x${v.height} ${v.fps} fps ${v.kbps} kbps ${v.codec} ${v.layer}` : 'no stats');
const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0);

const seats: Seat[] = [];
unthrottle();
try {
  const [ben, eetu] = await Promise.all([seat('ben', 1, true), seat('eetu', 2, false)]);
  seats.push(ben, eetu);
  const h264 = await ben.page.evaluate(() => !!RTCRtpSender.getCapabilities('video')?.codecs.some((c) => c.mimeType === 'video/H264'));
  await join(ben);
  await join(eetu);

  // Ben shares at the default 1080p60 through the dialog.
  await call(ben.page).getByRole('toolbar', { name: 'Call controls' }).getByRole('button', { name: 'Share your screen' }).click();
  const dialog = ben.page.getByRole('dialog', { name: 'Share your screen' });
  await dialog.waitFor();
  check(await dialog.getByRole('radio', { name: '1080p, 60 fps' }).isChecked(), 'the dialog offers 1080p60 by default');
  check(await dialog.getByRole('checkbox', { name: /Share audio/ }).isVisible(), 'Chromium is offered "Share audio"');
  await shot(ben.page, 'dialog');
  await dialog.getByRole('button', { name: 'Share', exact: true }).click();
  await screenTile(ben.page).waitFor({ timeout: 15_000 });

  // Eetu focuses the share, so adaptive streaming asks for the top layer, and turns the overlay on.
  await screenTile(eetu.page).waitFor({ timeout: 20_000 });
  await screenTile(eetu.page).click();
  await overlayOn(eetu.page);
  const full = await until(eetu.page, 45_000, (v) => v.width === 1920 && v.height === 1080 && v.fps > 0);
  check(full.ok, `the viewer receives 1920 x 1080 (${fmt(full.samples.at(-1))})`);
  // Ten more seconds at full size for the frame rate.
  const steady = await until(eetu.page, 10_000, () => false);
  const fps = mean(steady.samples.filter((v) => v.height === 1080).map((v) => v.fps));
  console.log(`     viewer frame rate at 1080p: ${fps} fps on average over ${steady.samples.length} s (${steady.samples.map((v) => v.fps).join(', ')})`);
  check(fps >= 10, `frames keep arriving at 1080p (${fps} fps)`);
  const codec = steady.samples.at(-1)?.codec ?? '';
  if (h264) check(codec === 'H264', `the share arrives as H.264, not a fall-back (${codec || 'none'})`);
  else notes.push(`this Chromium can't send H.264, so the codec check is unverifiable here (arrived as ${codec})`);

  await screenTile(ben.page).click();
  await overlayOn(ben.page);
  await ben.page.waitForTimeout(2500);
  const sender = await ben.page.locator('dl[data-role="sharer"]').first().evaluate((el: HTMLElement) => ({ ...el.dataset })).catch(() => null);
  console.log(`     sharer: codec ${sender?.codec ?? '?'}, encoder ${sender?.encoder ?? '?'}, limited by ${sender?.limit ?? '?'}, CPU limited ${sender?.cpu ?? '?'}`);
  if (h264) check(sender?.codec === 'H264', `the sharer's overlay shows H.264 (${sender?.codec ?? 'none'})`);
  await shot(eetu.page, 'viewer');
  await shot(ben.page, 'sharer');

  // Throttle LiveKit's sending to 1.5 Mbit/s: the viewer should step down a layer and keep getting frames.
  console.log('     throttling LiveKit to 1500 kbit/s');
  inLivekit('tc qdisc del dev eth0 root 2>/dev/null; tc qdisc add dev eth0 root tbf rate 1500kbit burst 32kbit latency 400ms');
  let throttled: { ok: boolean; samples: View[] };
  try {
    throttled = await until(eetu.page, 30_000, (v, all) => v.height > 0 && v.height < 1080 * 0.85 && all.slice(-3).filter((s) => s.fps > 0).length >= 3);
    await shot(eetu.page, 'throttled');
  } finally {
    unthrottle();
    console.log('     throttle removed');
  }
  const low = throttled.samples.at(-1);
  console.log(`     while throttled: ${throttled.samples.map((v) => `${v.height}p@${v.fps}`).join(', ')}`);
  check(throttled.ok, `throttled, the viewer drops to a lower layer while frames keep arriving (${fmt(low)})`);

  const sharerText = () => ben.page.locator('dl[data-role="sharer"]').first().innerText().then((t) => t.replace(/\s+/g, ' ')).catch(() => '?');
  const back = await until(eetu.page, Number(process.env.SHARE_BACK_MS ?? 90_000), (v, all) => {
    if (process.env.SHARE_DEBUG && all.length % 10 === 1) void sharerText().then((t) => console.log(`     ${all.length} s: viewer ${fmt(v)}; sharer ${t}`));
    return v.width === 1920 && v.height === 1080 && v.fps > 0;
  });
  check(back.ok, `1080p comes back once the throttle is lifted, after ${back.samples.length} s (${fmt(back.samples.at(-1))})`);

  await call(ben.page).getByRole('toolbar', { name: 'Call controls' }).getByRole('button', { name: 'Stop sharing' }).click();
  const gone = await screenTile(eetu.page).waitFor({ state: 'detached', timeout: 10_000 }).then(() => true, () => false);
  check(gone, 'stopping the share removes its tile for the viewer');
  for (const s of seats) await s.page.getByRole('button', { name: 'Disconnect' }).first().click();
  const problems = seats.flatMap((s) => [...s.problems.failed, ...s.problems.console]);
  check(problems.length === 0, `no failed requests or console errors${problems.length ? `: ${problems.slice(0, 6).join('; ')}` : ''}`);
} catch (e) {
  failures.push(String(e));
  console.log(`FAIL ${String(e).split('\n')[0]}`);
  for (const [i, s] of seats.entries()) {
    await shot(s.page, `failed-${i}`).catch(() => {});
    console.log(`  seat ${i}: ${[...s.problems.failed, ...s.problems.console].slice(0, 5).join('; ') || 'no problems logged'}`);
  }
} finally {
  unthrottle();
  await browser.close();
}
for (const n of notes) console.log(`note ${n}`);
console.log(failures.length ? `share: ${failures.length} failed` : 'share: all passed');
process.exit(failures.length ? 1 : 0);
