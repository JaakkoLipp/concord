/**
 * Shared pieces of the call checks written since M4.5 (voice-controls.ts, voice-channel.ts): a browser with the
 * speech-like fake microphone (media.ts), signed-in seats that count their join_call requests and peer
 * connections, joining a voice channel by name, and the audio bytes a page sends.
 */
import type { Browser, Page, Request } from 'playwright-core';
import { chromium } from 'playwright-core';
import { loadState } from '../../seed/src/config.ts';
import { APP, watch } from './browser.ts';
import { signIn } from './login.ts';
import { fakeMediaArgs } from './media.ts';

export const passes = (p: Promise<unknown>) => p.then(() => true, () => false);

export function voiceBrowser(): Promise<Browser> {
  return chromium.launch({ headless: true, args: [...fakeMediaArgs(), '--autoplay-policy=no-user-gesture-required'] });
}

export interface Seat { page: Page; joins: number; problems: ReturnType<typeof watch>; rnnoise: string[] }
let seatCount = 0;
/** A signed-in persona on the seeded server's #pelit, with voice settings stored before the client starts. `onPage` runs before the client loads. */
export async function seat(browser: Browser, handle: string, voice?: Record<string, unknown>, onPage?: (page: Page) => void): Promise<Seat> {
  const st = loadState()!;
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
  onPage?.(page);
  const s: Seat = { page, joins: 0, problems: watch(page), rnnoise: [] };
  page.on('response', (r) => { if (/rnnoise.*\.wasm/.test(r.url())) s.rnnoise.push(String(r.status())); });
  page.on('request', (r: Request) => { if (r.method() === 'POST' && r.url().endsWith('/join_call')) s.joins++; });
  if (process.env.VOICE_LOG) page.on('console', (m) => console.error(`[${handle}${seatNo}] ${m.type()} ${m.text().slice(0, 300)}`));
  await signIn(page, handle);
  await page.goto(`${APP}/channels/${st.serverId}/${st.channels.pelit}`);
  return s;
}

/** The dock and the voice panel: the call view repeats their buttons. */
export const dock = (p: Page) => p.getByRole('region', { name: 'Your account' }).or(p.locator('section[aria-label="Voice call"]'));
/** The sidebar's list of who is in a voice channel. */
export const inChannel = (p: Page, channel: string) => p.getByRole('list', { name: `In ${channel}` });

/** Clicks the voice channel in the sidebar and waits for "Voice connected", or says why not. */
export async function join(s: Seat, channel: string): Promise<void> {
  await s.page.getByRole('link', { name: new RegExp(`^${channel}`) }).click();
  const ok = await passes(s.page.getByText('Voice connected').waitFor({ timeout: 20_000 }));
  if (!ok) {
    const panel = await s.page.locator('section[aria-label="Voice call"]').innerText().catch(() => '(no panel)');
    const toasts = await s.page.getByRole('status').allInnerTexts().catch(() => []);
    throw new Error(`no "Voice connected" in 20 s; panel: ${JSON.stringify(panel)}; status: ${JSON.stringify(toasts)}; join_call: ${s.joins}`);
  }
}

/** Audio bytes this page sends per second, over two seconds. */
export async function sending(p: Page): Promise<number> {
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

/** Audio bytes this page receives per second, over two seconds. */
export async function receiving(p: Page): Promise<number> {
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
