/**
 * TURN over TLS check (m3-plan.md task 3): join a voice channel through the screen-share test page with relay-only
 * ICE, keep only the turns: server so UDP TURN can't be used, share a fake screen, and read the selected candidate.
 * Passes when the relay protocol is TLS from the turns: URL and video bytes flow.
 * Chrome may report the candidate as prflx rather than relay (m3-plan.md), so the check doesn't look at the type.
 *
 * Usage: node tools/live/src/turn.ts <persona>          a seeded persona on a dev stack
 *        TURN_EMAIL=… TURN_PASSWORD=… node tools/live/src/turn.ts   any account, typed by whoever runs it
 */
import { chromium } from 'playwright-core';
import { loadState } from '../../seed/src/config.ts';
import { passwordFor } from '../../seed/src/seed.ts';
import { APP } from './browser.ts';

const persona = process.argv[2];
const email = persona ? (loadState()?.personas[persona]?.email ?? '') : (process.env.TURN_EMAIL ?? '');
const password = persona ? passwordFor(persona) : (process.env.TURN_PASSWORD ?? '');
if (!email || !password) throw new Error('usage: turn.ts <persona>, or TURN_EMAIL and TURN_PASSWORD');

const browser = await chromium.launch({ headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--auto-select-desktop-capture-source=Entire screen'] });
const page = await browser.newPage();
await page.addInitScript(() => {
  const keepTls = (cfg?: RTCConfiguration): RTCConfiguration | undefined => cfg && {
    ...cfg,
    iceServers: (cfg.iceServers ?? [])
      .map((s) => ({ ...s, urls: ([] as string[]).concat(s.urls).filter((u) => u.startsWith('turns:')) }))
      .filter((s) => s.urls.length),
  };
  const Native = window.RTCPeerConnection;
  const pcs: RTCPeerConnection[] = [];
  (window as unknown as { __pcs: RTCPeerConnection[] }).__pcs = pcs;
  class Tls extends Native {
    constructor(cfg?: RTCConfiguration) { super(keepTls(cfg)); pcs.push(this); }
    override setConfiguration(cfg?: RTCConfiguration) { super.setConfiguration(keepTls(cfg)); }
  }
  window.RTCPeerConnection = Tls;
});
await page.goto(new URL('/spike/', APP).href);
await page.fill('input[name=email]', email);
await page.fill('input[name=password]', password);
await page.click('#login-form button');
await page.waitForSelector('#setup:not([hidden])', { timeout: 20_000 });
await page.selectOption('#relay', 'yes');
await page.click('#join');
const joined = await page.waitForSelector('#share:not([disabled])', { timeout: 30_000 }).then(() => true, () => false);
if (!joined) {
  console.log(await page.$eval('#log', (e) => e.textContent));
  await browser.close();
  console.log('FAIL: could not connect with relay-only ICE over TURN/TLS');
  process.exit(1);
}
await page.click('#share');
await page.waitForTimeout(12_000);
const pairs = await page.evaluate(async () => {
  const out: { state: string; url?: string; relayProtocol?: string; sent: number }[] = [];
  for (const pc of (window as unknown as { __pcs: RTCPeerConnection[] }).__pcs) {
    const stats = await pc.getStats();
    const byId = new Map<string, Record<string, unknown>>();
    stats.forEach((s: Record<string, unknown>) => byId.set(s.id as string, s));
    const transport = [...byId.values()].find((s) => s.type === 'transport' && s.selectedCandidatePairId);
    const pair = transport && byId.get(transport.selectedCandidatePairId as string);
    const local = pair && byId.get(pair.localCandidateId as string);
    out.push({ state: pc.connectionState, url: local?.url as string, relayProtocol: local?.relayProtocol as string, sent: Number(pair?.bytesSent ?? 0) });
  }
  return out;
});
await page.click('#leave').catch(() => {});
await browser.close();
console.log(JSON.stringify(pairs));
const ok = pairs.some((p) => p.state === 'connected' && p.relayProtocol === 'tls' && p.url?.startsWith('turns:') && p.sent > 1_000_000);
console.log(ok ? 'ok: media relayed over TURN/TLS' : 'FAIL: no connection relayed over TURN/TLS with video flowing');
process.exit(ok ? 0 : 1);
