/**
 * Screen share (m4-plan.md task 7), on the local dev stack: `ben` shares a fake 1080p screen with moving content
 * into Olohuone, and `eetu` watches it. Only two browsers, so a headless software encoder isn't starved of CPU.
 * Checks, read from the viewer's stats overlay:
 * - the share starts unwatched (m4.5-plan.md task 6): no video arrives for the viewer until "Watch stream" is
 *   clicked, and "Stop watching" in the tile's menu stops it again,
 * - the share reaches the viewer at 1920 x 1080, and at what frame rate,
 * - it arrives as H.264, so a silent fall-back to VP8 fails. If this Chromium can't send H.264 at all, that is
 *   reported as unverifiable instead,
 * - the sharer's upload policed to 1.5 Mbit/s (LiveKit's incoming UDP, with `tc` in its network namespace) moves the
 *   viewer to a lower layer while frames keep arriving, and freeing it brings 1080p back,
 * - the viewer's downlink shaped to 1.5 Mbit/s (`tbf` on what LiveKit sends) does the same. Whether 1080p comes back
 *   after that is reported, not failed: LiveKit's receive-side estimate can stay low for minutes (m4-results.md).
 * Either throttle hits every client of the local LiveKit at once, so each stays on only until the viewer steps
 * down, and both are always removed.
 * Review screenshots: the share dialog, the viewer's and the sharer's overlays, and the viewer under each throttle.
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
/** Removes both kinds of throttle. */
const CLEAR = 'tc qdisc del dev eth0 root 2>/dev/null; tc qdisc del dev eth0 ingress 2>/dev/null; true';
const unthrottle = () => { try { inLivekit(CLEAR); } catch { /* nothing to remove */ } };
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
  // Every peer connection, for the video bytes that arrive.
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

/** Video bytes this page receives per second, over two seconds. */
async function videoIn(p: Page): Promise<number> {
  const total = () => p.evaluate(async () => {
    let bytes = 0;
    for (const pc of (window as unknown as { __pcs: RTCPeerConnection[] }).__pcs) {
      if (pc.connectionState === 'closed') continue;
      (await pc.getStats()).forEach((v: { type: string; kind?: string; bytesReceived?: number }) => { if (v.type === 'inbound-rtp' && v.kind === 'video') bytes += v.bytesReceived ?? 0; });
    }
    return bytes;
  });
  const before = await total();
  await p.waitForTimeout(2_000);
  return Math.round(((await total()) - before) / 2);
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

  // The share starts unwatched: nothing of it arrives until Eetu clicks "Watch stream".
  await screenTile(eetu.page).waitFor({ timeout: 20_000 });
  await eetu.page.waitForTimeout(3_000);
  const before = await videoIn(eetu.page);
  const watchButton = call(eetu.page).getByRole('button', { name: 'Watch stream' });
  check(before < 1_000 && await watchButton.isVisible(), `the share starts unwatched: ${before} B/s of video arrive before "Watch stream"`);
  await watchButton.click();
  // Eetu focuses the share, so adaptive streaming asks for the top layer, and turns the overlay on.
  await screenTile(eetu.page).click();
  await overlayOn(eetu.page);
  const full = await until(eetu.page, 45_000, (v) => v.width === 1920 && v.height === 1080 && v.fps > 0);
  check(full.ok, `the viewer receives 1920 x 1080 (${fmt(full.samples.at(-1))})`);
  // The frame rate ramps up while the viewer's bandwidth estimate grows: wait for 3 s in a row at 50 fps or more.
  const started = Date.now();
  const ramp = await until(eetu.page, 30_000, (_v, all) => all.length >= 3 && all.slice(-3).every((s) => s.height === 1080 && s.fps >= 50));
  const steady = await until(eetu.page, 5_000, () => false);
  const fps = mean(steady.samples.filter((v) => v.height === 1080).map((v) => v.fps));
  console.log(`     viewer frame rate at 1080p: ${ramp.ok ? `50+ fps after ${Math.round((Date.now() - started) / 1000) - 5} s` : 'never 50+ for 3 s'}, then ${fps} fps on average (ramp ${ramp.samples.map((v) => v.fps).join(', ')})`);
  check(fps >= 10, `frames keep arriving at 1080p (${fps} fps)`);
  const codec = steady.samples.at(-1)?.codec ?? '';
  if (h264) check(codec === 'H264', `the share arrives as H.264, not a fall-back (${codec || 'none'})`);
  else notes.push(`this Chromium can't send H.264, so the codec check is unverifiable here (arrived as ${codec})`);

  await screenTile(ben.page).click();
  await overlayOn(ben.page);
  await ben.page.waitForTimeout(2500);
  const sharerData = () => ben.page.locator('dl[data-role="sharer"]').first().evaluate((el: HTMLElement) => ({ ...el.dataset })).catch(() => null);
  const sharerText = () => ben.page.locator('dl[data-role="sharer"]').first().innerText().then((t) => t.replace(/\s+/g, ' ').replace(/^.*?CPU limited \S+ /, '')).catch(() => '?');
  const sender = await sharerData();
  console.log(`     sharer: codec ${sender?.codec ?? '?'}, encoder ${sender?.encoder ?? '?'}, limited by ${sender?.limit ?? '?'}, CPU limited ${sender?.cpu ?? '?'}; ${await sharerText()}`);
  if (h264) check(sender?.codec === 'H264', `the sharer's overlay shows H.264 (${sender?.codec ?? 'none'})`);
  await shot(eetu.page, 'viewer');
  await shot(ben.page, 'sharer');

  const lower = (v: View, all: View[]) => v.height > 0 && v.height < 1080 * 0.85 && all.slice(-3).filter((s) => s.fps > 0).length >= 3;
  const top = (v: View) => v.width === 1920 && v.height === 1080 && v.fps > 0;

  // 1. The sharer's upload: LiveKit's incoming UDP policed to 1.5 Mbit/s. Signalling, on TCP, is left alone.
  console.log('     policing what reaches LiveKit over UDP to 1500 kbit/s');
  inLivekit(`${CLEAR}; tc qdisc add dev eth0 handle ffff: ingress && tc filter add dev eth0 parent ffff: protocol ip prio 1 u32 match ip protocol 17 0xff police rate 1500kbit burst 32k drop flowid :1`);
  let up: { ok: boolean; samples: View[] };
  let upSharer: Record<string, string | undefined> | null = null;
  try {
    up = await until(eetu.page, 40_000, lower);
    upSharer = await sharerData();
    console.log(`     sharer while policed: limited by ${upSharer?.limit ?? '?'}; ${await sharerText()}`);
    await shot(eetu.page, 'upload-throttled');
  } finally {
    unthrottle();
    console.log('     removed');
  }
  console.log(`     viewer while policed: ${up.samples.map((v) => `${v.height}p@${v.fps}`).join(', ')}`);
  check(up.ok, `with the sharer's upload at 1.5 Mbit/s, the viewer drops to a lower layer while frames keep arriving (${fmt(up.samples.at(-1))})`);
  const upBack = await until(eetu.page, 90_000, top);
  if (!upBack.ok) console.log(`     sharer: ${await sharerText()}`);
  check(upBack.ok, `1080p comes back once the upload is free, after ${upBack.samples.length} s (${fmt(upBack.samples.at(-1))})`);

  // 2. The viewer's downlink: what LiveKit sends, through tbf. Last, because LiveKit's estimate for the viewer
  // can stay low for minutes afterwards (m4-results.md, task 7).
  console.log('     shaping what LiveKit sends to 1500 kbit/s');
  inLivekit(`${CLEAR}; tc qdisc add dev eth0 root tbf rate 1500kbit burst 32kbit latency 400ms`);
  let down: { ok: boolean; samples: View[] };
  try {
    down = await until(eetu.page, 30_000, lower);
    await shot(eetu.page, 'downlink-throttled');
  } finally {
    unthrottle();
    console.log('     removed');
  }
  console.log(`     viewer while shaped: ${down.samples.map((v) => `${v.height}p@${v.fps}`).join(', ')}`);
  check(down.ok, `with the viewer's downlink at 1.5 Mbit/s, the viewer drops to a lower layer while frames keep arriving (${fmt(down.samples.at(-1))})`);
  const downBack = await until(eetu.page, Number(process.env.SHARE_BACK_MS ?? 60_000), top);
  if (downBack.ok) console.log(`ok   1080p comes back once the downlink is free, after ${downBack.samples.length} s`);
  else {
    console.log(`known 1080p didn't come back within ${downBack.samples.length} s of freeing the downlink (${fmt(downBack.samples.at(-1))}), while the sharer sends ${await sharerText()}`);
    notes.push("after a downlink squeeze LiveKit's receive-side estimate for the viewer stays low: see m4-results.md, task 7");
  }

  // "Stop watching" in the tile's menu: the video stops arriving, and the tile offers "Watch stream" again.
  await screenTile(eetu.page).click({ button: 'right' });
  await eetu.page.getByRole('menu').getByRole('menuitem', { name: 'Stop watching' }).click();
  const offered = await call(eetu.page).getByRole('button', { name: 'Watch stream' }).waitFor({ timeout: 5_000 }).then(() => true, () => false);
  await eetu.page.waitForTimeout(2_000);
  const after = await videoIn(eetu.page);
  check(offered && after < 1_000, `"Stop watching" stops the video: ${after} B/s, and the tile offers "Watch stream" again`);

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
