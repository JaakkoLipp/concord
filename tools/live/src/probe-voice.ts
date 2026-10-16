/**
 * m4.7-plan.md task 1, the voice probes, on the throwaway server from probe-moderation.ts: `tuuli` is in a call
 * in a browser and `onni`, the Moderator, acts on her over the API. What each client receives, how its call
 * panel changes and what it sends are printed. The answers go in docs/m4.7-results.md.
 * `node tools/live/src/probe-voice.ts [move|mute|deafen|disconnect|timeout|reconnect|all]`
 */
import type { Page } from 'playwright-core';
import { APP } from './browser.ts';
import { join, receiving, seat, sending, voiceBrowser, type Seat } from './calls.ts';
import { answer, cleanup, setup } from './probe-moderation.ts';
import { ApiError } from '../../seed/src/http.ts';
import { describe } from './livekit-admin.ts';

const which = process.argv[2] ?? 'all';
const SHOWN = /Voice|Move|Member|Call/;
const p = await setup();
let browser = await voiceBrowser();
const t0 = Date.now();
const now = () => Date.now() - t0;
const log = (...a: unknown[]) => console.log(`[${String(now()).padStart(6)}]`, ...a);

interface Watched { seat: Seat; frames: { at: number; type: string; brief: string }[]; panel: { at: number; text: string }[]; stop(): void }
const brief = (f: Record<string, unknown>) => JSON.stringify(f, (k, v) => (k === 'token' ? '<token>' : typeof v === 'string' && v.length > 60 ? v.slice(0, 20) + '…' : v)).slice(0, 260);

/** A signed-in browser seat on the probe server, with the frames its socket receives and its panel text over time. */
async function watched(handle: string): Promise<Watched> {
  const frames: Watched['frames'] = [];
  const panel: Watched['panel'] = [];
  const s = await seat(browser, handle, undefined, (page) => {
    page.on('websocket', (ws) => {
      if (!ws.url().includes('/ws')) return;
      ws.on('framereceived', (e) => {
        const walk = (f: Record<string, unknown>): void => {
          if (f.type === 'Bulk') return void (f.v as Record<string, unknown>[]).forEach(walk);
          if (SHOWN.test(String(f.type))) frames.push({ at: now(), type: String(f.type), brief: brief(f) });
        };
        try { walk(JSON.parse(String(e.payload))); } catch { /* not JSON */ }
      });
    });
  });
  await s.page.goto(`${APP}/channels/${p.server}/${p.text}`, { waitUntil: 'networkidle' });
  const timer = setInterval(() => {
    s.page.locator('section[aria-label="Voice call"]').innerText({ timeout: 150 }).then((t) => {
      const text = t.replace(/\s+/g, ' ').trim();
      if (panel.at(-1)?.text !== text) panel.push({ at: now(), text });
    }, () => { if (panel.at(-1)?.text !== '(no panel)') panel.push({ at: now(), text: '(no panel)' }); });
  }, 200);
  return { seat: s, frames, panel, stop: () => clearInterval(timer) };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const report = (name: string, w: Watched, from: number) => {
  console.log(`  ${name}: frames`);
  for (const f of w.frames.filter((x) => x.at >= from)) console.log(`    +${f.at - from} ${f.brief}`);
  console.log(`  ${name}: panel`);
  for (const x of w.panel.filter((y) => y.at >= from)) console.log(`    +${x.at - from} ${x.text.slice(0, 140)}`);
};
const who = async (page: Page) => (await Promise.all(['Alpha', 'Beta'].map(async (c) => `${c}: ${await page.getByRole('list', { name: `In ${c}` }).innerText().then((t) => t.replace(/\s+/g, ' ').trim(), () => '(none)')}`))).join(' | ');
const names = { [p.target.id]: 'tuuli', [p.mod.id]: 'onni', [p.owner.id]: 'owner' };
const lk = async () => `Alpha {${await describe(p.voiceA, names)}} Beta {${await describe(p.voiceB, names)}}`;
const edit = (body: unknown) => answer(p.mod.call('PATCH', `/servers/${p.server}/members/${p.target.id}`, body));

let tuuli!: Watched;
let onni!: Watched;
let all: Watched[] = [];
/** A new browser process and seats for each scenario: after a first call ends, Docker Desktop's UDP forwarding can leave the next connection of the same browser stuck in "Connecting…". */
async function fresh(): Promise<void> {
  for (const w of all) w.stop();
  await browser.close().catch(() => {});
  browser = await voiceBrowser();
  tuuli = await watched('tuuli');
  onni = await watched('onni');
  all = [tuuli, onni];
  await sleep(6_000); // the /servers bucket (5 per 10 s) refills before the scenario's requests
}
const mark = now;

try {
  if (which === 'move' || which === 'all') {
    await fresh();
    log('MOVE: tuuli in Alpha, onni (Moderator, in no call) moves her to Beta over the API');
    await join(tuuli.seat, 'Alpha');
    await sleep(3_000);
    const joinsBefore = tuuli.seat.joins;
    log('  tuuli sends', await sending(tuuli.seat.page), 'B/s');
    const from = mark();
    log('  LiveKit before:', await lk());
    log('  PATCH voice_channel=Beta:', await edit({ voice_channel: p.voiceB }));
    await sleep(8_000);
    log('  LiveKit after:', await lk());
    report('tuuli', tuuli, from);
    report('onni (watching, in no call)', onni, from);
    log('  join_call requests since:', tuuli.seat.joins - joinsBefore, '; her sidebar:', await who(tuuli.seat.page), '; onni sidebar:', await who(onni.seat.page));
    log('  tuuli sends now', await sending(tuuli.seat.page), 'B/s');
  }

  if (which === 'mute' || which === 'all') {
    for (const mod of ['none', 'other', 'same'] as const) {
      await fresh();
      log(`MUTE: tuuli in Alpha, the moderator in ${mod === 'none' ? 'no call' : mod === 'other' ? 'Beta' : 'Alpha'} server-mutes her (can_publish=false)`);
      await join(tuuli.seat, 'Alpha');
      if (mod !== 'none') await join(onni.seat, mod === 'other' ? 'Beta' : 'Alpha');
      await sleep(2_000);
      const before = [await sending(tuuli.seat.page), mod === 'none' ? 0 : await sending(onni.seat.page)];
      const from = mark();
      log('  LiveKit before:', await lk());
      log('  PATCH can_publish=false:', await edit({ can_publish: false }));
      await sleep(3_000);
      log('  LiveKit after mute:', await lk());
      const during = [await sending(tuuli.seat.page), mod === 'none' ? 0 : await sending(onni.seat.page)];
      log(`  tuuli sends ${before[0]} -> ${during[0]} B/s; moderator sends ${before[1]} -> ${during[1]} B/s`);
      report('tuuli', tuuli, from);
      if (mod !== 'none') report('onni', onni, from);
      const from2 = mark();
      log('  PATCH can_publish=true:', await edit({ can_publish: true }));
      await sleep(3_000);
      log('  LiveKit after unmute:', await lk());
      log(`  after unmute tuuli sends ${await sending(tuuli.seat.page)} B/s; moderator sends ${mod === 'none' ? 0 : await sending(onni.seat.page)} B/s`);
      report('tuuli', tuuli, from2);
      }
  }

  if (which === 'deafen' || which === 'all') {
    for (const mod of ['none', 'same'] as const) {
      await fresh();
      log(`DEAFEN: tuuli and the moderator in Alpha${mod === 'none' ? ' (moderator not in a call)' : ''}; can_receive=false`);
      await join(tuuli.seat, 'Alpha');
      if (mod === 'same') await join(onni.seat, 'Alpha');
      else await join(onni.seat, 'Beta');
      await sleep(2_000);
      const before = [await receiving(tuuli.seat.page), await receiving(onni.seat.page)];
      const from = mark();
      log('  LiveKit before:', await lk());
      log('  PATCH can_receive=false:', await edit({ can_receive: false }));
      await sleep(3_000);
      log('  LiveKit after deafen:', await lk());
      const during = [await receiving(tuuli.seat.page), await receiving(onni.seat.page)];
      log(`  tuuli receives ${before[0]} -> ${during[0]} B/s; moderator receives ${before[1]} -> ${during[1]} B/s`);
      report('tuuli', tuuli, from);
      await edit({ can_receive: true });
      }
  }

  if (which === 'disconnect' || which === 'all') {
    await fresh();
    log('DISCONNECT: tuuli and the moderator in Alpha; remove=["VoiceChannel"]');
    await join(tuuli.seat, 'Alpha');
    await join(onni.seat, 'Alpha');
    await sleep(3_000);
    const from = mark();
    log('  LiveKit before:', await lk());
    log('  PATCH remove VoiceChannel:', await edit({ remove: ['VoiceChannel'] }));
    await sleep(5_000);
    log('  LiveKit after:', await lk());
    report('tuuli', tuuli, from);
    report('onni', onni, from);
    log('  sidebar:', await who(tuuli.seat.page));
  }

  if (which === 'timeout' || which === 'all') {
    await fresh();
    log('TIMEOUT: tuuli talking in Alpha is timed out for 20 s');
    await join(tuuli.seat, 'Alpha');
    await join(onni.seat, 'Alpha');
    await sleep(3_000);
    const before = await sending(tuuli.seat.page);
    const from = mark();
    log('  PATCH timeout:', await edit({ timeout: new Date(Date.now() + 20_000).toISOString() }));
    await sleep(3_000);
    log('  LiveKit after:', await lk());
    log(`  tuuli sends ${before} -> ${await sending(tuuli.seat.page)} B/s; hears ${await receiving(tuuli.seat.page)} B/s`);
    report('tuuli', tuuli, from);
    log('  join_call for a timed-out member:', await answer(p.target.call('POST', `/channels/${p.voiceB}/join_call`, { node: 'worldwide' })));
    await edit({ timeout: null });
  }

  if (which === 'reconnect' || which === 'all') {
    await fresh();
    log('RECONNECT: tuuli in Alpha goes offline for 4 s; she is moved to Beta while offline');
    await join(tuuli.seat, 'Alpha');
    await sleep(3_000);
    const joinsBefore = tuuli.seat.joins;
    const from = mark();
    await tuuli.seat.page.context().setOffline(true);
    await sleep(1_500);
    log('  PATCH voice_channel=Beta:', await edit({ voice_channel: p.voiceB }));
    await sleep(2_500);
    await tuuli.seat.page.context().setOffline(false);
    await sleep(15_000);
    report('tuuli', tuuli, from);
    log('  join_call requests since:', tuuli.seat.joins - joinsBefore, '; sidebar:', await who(onni.seat.page), '; tuuli sends', await sending(tuuli.seat.page), 'B/s');
  }
} catch (e) {
  console.error(e instanceof ApiError ? `${e.message}` : e);
  process.exitCode = 1;
} finally {
  for (const w of all) w.stop();
  await browser.close().catch(() => {});
  await cleanup(p);
}
