/**
 * Reconnects (m4-plan.md task 9), on the local dev stack only: it cuts media and restarts LiveKit there.
 * `dev` and `aino` in Pelaamo, `ben` a third who closes his browser without leaving.
 * - Media into LiveKit dropped for 15 s (iptables in its network namespace, since Playwright's offline mode
 *   doesn't reach WebRTC): the call stays up, and audio flows again afterwards without a click.
 * - LiveKit restarted: both see "Reconnecting…", then "Voice connected" within 60 s through LiveKit's own
 *   reconnect, and audio flows again.
 * - Whether ben, gone without a leave just before the restart, is still listed afterwards. Reported, not failed:
 *   LiveKit forgets him in the restart and voice-ingress never hears he left (m4-results.md, task 9). Also
 *   reported: whether his next call clears it, and anyone in the call whom the sidebar leaves out.
 * Usage: node tools/live/src/voice-restart.ts
 */
import { execFileSync } from 'node:child_process';
import { chromium, type BrowserContext, type Page } from 'playwright-core';
import { loadState } from '../../seed/src/config.ts';
import { assertDevStack } from '../../seed/src/vps.ts';
import { LOCAL } from '../../target.ts';
import { APP } from './browser.ts';
import { signIn } from './login.ts';
import { fakeMediaArgs } from './media.ts';

await assertDevStack();
if (!LOCAL) throw new Error('voice-restart.ts restarts LiveKit, so it runs on the local stack only');
const st = loadState()!;
const failures: string[] = [];
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failures.push(what); };
const stack = (cmd: string) => execFileSync('bash', ['-c', `cd ~/stoat && ${cmd}`], { encoding: 'utf8' });
/** A command in LiveKit's network namespace, from a short-lived container with the tools. */
const netns = (cmd: string) => execFileSync('docker', ['run', '--rm', '--cap-add', 'NET_ADMIN', '--network', 'container:stoat-livekit-1', 'nicolaka/netshoot:v0.14', 'sh', '-c', cmd], { encoding: 'utf8' });

const browser = await chromium.launch({ args: [...fakeMediaArgs(), '--autoplay-policy=no-user-gesture-required'] });
interface Seat { ctx: BrowserContext; page: Page }
/** The voice panel says "Voice connected". Any visible copy: screen readers get the same words announced. */
const connected = (p: Page, ms: number) => p.waitForFunction(() => [...document.querySelectorAll('[role="status"]')].some((e) => e.textContent?.trim() === 'Voice connected' && (e as HTMLElement).offsetParent !== null), undefined, { timeout: ms }).then(() => true, () => false);

async function seat(handle: string): Promise<Seat> {
  const ctx = await browser.newContext({ permissions: ['microphone'] });
  await ctx.addInitScript(() => {
    const Original = window.RTCPeerConnection;
    const all: RTCPeerConnection[] = ((window as unknown as { __pcs: RTCPeerConnection[] }).__pcs = []);
    window.RTCPeerConnection = function (...args: ConstructorParameters<typeof RTCPeerConnection>) {
      const pc = new Original(...args);
      all.push(pc);
      return pc;
    } as unknown as typeof RTCPeerConnection;
    window.RTCPeerConnection.prototype = Original.prototype;
  });
  const page = await ctx.newPage();
  const calls: string[] = [];
  page.on('response', (r) => { if (r.url().endsWith('/join_call')) void r.text().then((t) => calls.push(`${r.status()} ${t.slice(0, 80)}`), () => calls.push(String(r.status()))); });
  await signIn(page, handle);
  await page.goto(`${APP}/channels/${st.serverId}/${st.channels.pelit}`);
  await page.getByRole('link', { name: /^Pelaamo/ }).click();
  // Up to 45 s: a join soon after an earlier restart is slow while LiveKit's webhooks still fail.
  const t0 = Date.now();
  if (!(await connected(page, 45_000))) {
    const panel = await page.locator('section[aria-label="Voice call"]').first().innerText().catch(() => '(no panel)');
    await page.screenshot({ path: `${process.env.SHOTS ?? '/tmp'}/voice-restart-${handle}.png` }).catch(() => {});
    const said = await page.locator('[role="status"], [role="alert"]').allInnerTexts().catch(() => []);
    throw new Error(`${handle} got no "Voice connected" in 45 s; panel: ${JSON.stringify(panel)}; said: ${JSON.stringify(said.filter(Boolean))}; join_call: ${JSON.stringify(calls)}`);
  }
  if (Date.now() - t0 > 10_000) console.log(`note ${handle}'s join took ${Math.round((Date.now() - t0) / 1000)} s`);
  return { ctx, page };
}
/** Audio bytes received per second, over two seconds. */
async function hearing(p: Page): Promise<number> {
  const total = () => p.evaluate(async () => {
    let bytes = 0;
    for (const pc of (window as unknown as { __pcs: RTCPeerConnection[] }).__pcs) {
      if (pc.connectionState === 'closed') continue;
      (await pc.getStats()).forEach((v: { type: string; kind?: string; bytesReceived?: number }) => { if (v.type === 'inbound-rtp' && v.kind === 'audio') bytes += v.bytesReceived ?? 0; });
    }
    return bytes;
  });
  const before = await total();
  await p.waitForTimeout(2_000);
  return Math.round(((await total()) - before) / 2);
}
const listed = (p: Page) => p.getByRole('list', { name: 'In Pelaamo' }).getByRole('button').evaluateAll((els) => els.map((e) => (e.getAttribute('aria-label') ?? '').split(',')[0])).catch(() => [] as string[]);
const RULES = ['-p udp --dport 50000:50100 -j DROP', '-p tcp --dport 7881 -j DROP'];

let cut = false;
try {
  const [dev, aino] = await Promise.all([seat('dev'), seat('aino')]);
  const before = await hearing(aino.page);

  netns(RULES.map((r) => `iptables -I INPUT ${r}`).join(' && '));
  cut = true;
  await aino.page.waitForTimeout(15_000);
  const during = await hearing(aino.page);
  netns(RULES.map((r) => `iptables -D INPUT ${r}`).join(' && '));
  cut = false;
  await aino.page.waitForTimeout(5_000);
  const after = await hearing(aino.page);
  const up = (await connected(dev.page, 1_000)) && (await connected(aino.page, 1_000));
  check(during < before / 10 && after > before / 2 && up, `a 15 s media cut: audio ${before} B/s, ${during} during, ${after} after, and the call stayed up`);

  const ben = await seat('ben');
  await dev.page.waitForTimeout(3_000);
  await ben.ctx.close();
  stack('concord/dc restart livekit >/dev/null 2>&1');
  const lost = await Promise.all([dev, aino].map((s) => s.page.getByText('Reconnecting…').first().waitFor({ timeout: 30_000 }).then(() => true, () => false)));
  check(lost.every(Boolean), 'both see "Reconnecting…" after the restart');
  const t0 = Date.now();
  const back = await Promise.all([dev, aino].map((s) => connected(s.page, 60_000).then((ok) => (ok ? Math.round((Date.now() - t0) / 1000) : null))));
  check(back.every((t) => t !== null), `after a LiveKit restart both are back without a click (dev ${back[0]} s, aino ${back[1]} s)`);
  await aino.page.waitForTimeout(5_000);
  const heard = await hearing(aino.page);
  check(heard > before / 2, `and audio flows again (${heard} B/s)`);
  await dev.page.waitForTimeout(25_000);
  const names = await listed(dev.page);
  const ghost = names.includes('Ben Carter');
  const missing = ['Dev', 'Aino Virtanen'].filter((n) => !names.includes(n));
  if (missing.length) console.log(`note 30 s after the restart the sidebar leaves out ${missing.join(' and ')}, though they are in the call`);
  console.log(`note ben, who closed his browser just before the restart, ${ghost ? 'is still listed' : 'is gone'} 30 s later: ${JSON.stringify(names)}`);
  if (ghost) {
    // His next call clears it: join, then leave properly.
    const again = await seat('ben');
    await again.page.locator('section[aria-label="Voice call"]').getByRole('button', { name: 'Disconnect' }).click();
    const t1 = Date.now();
    const gone = await dev.page.waitForFunction(() => ![...document.querySelectorAll('[aria-label^="In Pelaamo"] button')].some((b) => b.getAttribute('aria-label')?.startsWith('Ben Carter')), undefined, { timeout: 60_000 }).then(() => true, () => false);
    // Timed by voice-ingress, which fails LiveKit's webhooks for a while after a restart, so reported only.
    console.log(`note his next call ${gone ? `cleared the leftover in ${Math.round((Date.now() - t1) / 1000)} s` : "didn't clear the leftover in 60 s"}`);
  }
  for (const s of [dev, aino]) await s.page.locator('section[aria-label="Voice call"]').getByRole('button', { name: 'Disconnect' }).click().catch(() => {});
} catch (e) {
  failures.push(String(e));
  console.log(`FAIL ${String(e).split('\n')[0]}`);
} finally {
  if (cut) netns(RULES.map((r) => `iptables -D INPUT ${r}`).join('; '));
  await browser.close();
}
console.log(failures.length ? `voice-restart: ${failures.length} failed` : 'voice-restart: all passed');
process.exit(failures.length ? 1 : 0);
