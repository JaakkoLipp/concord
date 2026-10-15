/**
 * DM and group calls (m4-plan.md task 8, client.md section 10.8), on the local dev stack only, with `sanna`,
 * `lauri` and `maija` in three browsers with Chromium's fake microphone. Checks:
 * - sanna calls lauri in their DM and sees "Calling…"; lauri's ringing card shows within 2 s of sanna connecting,
 * - Ignore stops it, and it stays stopped,
 * - a second call rings again, and sanna leaving clears lauri's card,
 * - an unanswered call notifies lauri's hidden tab, and stops ringing after 30 s, closing the notification,
 * - a third call that lauri joins from the card connects both: both see "Voice connected",
 * - in a group of the three, a call rings both others; lauri joins from the card, and maija ignores it and then
 *   joins from the call_started line's Join.
 * Stoat's VoiceCallUpdate and voice join and leave frames are logged with their times, for the results.
 * The friendships, the DM and the group are made over the API if missing, and kept for the next run.
 * Usage: node tools/live/src/dm-call.ts [screenshot-dir]
 */
import type { Browser, Page } from 'playwright-core';
import { chromium } from 'playwright-core';
import { APP, watch, type PageProblems } from './browser.ts';
import { signIn } from './login.ts';
import { person, type Person } from './people.ts';

const out = process.argv[2];
const failures: string[] = [];
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failures.push(what); };
const passes = (p: Promise<unknown>) => p.then(() => true, () => false);
const GROUP = 'Puhelurinki';

// ---------- the people, their friendships, the DM and the group, over the API ----------

const [sanna, lauri, maija] = await Promise.all(['sanna', 'lauri', 'maija'].map(person)) as [Person, Person, Person];
async function befriend(a: Person, b: Person) {
  const rel = (await a.call<{ relationship?: string }>('GET', `/users/${b.id}`)).relationship;
  if (rel === 'Friend') return;
  if (rel !== 'Outgoing') await a.call('POST', '/users/friend', { username: b.tag });
  await b.call('PUT', `/users/${a.id}/friend`);
}
await befriend(sanna, lauri);
await befriend(sanna, maija);
const dm = (await sanna.call<{ _id: string }>('GET', `/users/${lauri.id}/dm`))._id;
const dms = await sanna.call<{ _id: string; channel_type: string; name?: string; recipients?: string[] }[]>('GET', '/users/dms');
const want = [sanna.id, lauri.id, maija.id].sort().join();
const group = dms.find((c) => c.channel_type === 'Group' && c.name === GROUP && [...(c.recipients ?? [])].sort().join() === want)?._id
  ?? (await sanna.call<{ _id: string }>('POST', '/channels/create', { name: GROUP, users: [lauri.id, maija.id] }))._id;

// ---------- browsers ----------

// No audio output: WSLg's one audio server is shared by every browser on the machine, and with output on it
// sometimes stalled a join for 20 s, with "The AudioContext encountered an error from the audio device".
const browser: Browser = await chromium.launch({
  headless: true,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required', '--disable-audio-output'],
});
let t0 = performance.now();
const since = () => Math.round(performance.now() - t0);
/** Stoat's call frames as each page received them, and what the browsers did, in ms since the run began. */
const frames: string[] = [];
const start = performance.now();
const clock = () => String(Math.round(performance.now() - start)).padStart(6);
const mark = (what: string) => frames.push(`${clock()} ms  -- ${what}`);

interface Seat { handle: string; page: Page; problems: PageProblems }
async function seat(handle: string): Promise<Seat> {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, permissions: ['microphone'] });
  // Notifications on, through a stand-in that records them: a headless browser shows none.
  await context.addInitScript(() => {
    localStorage.setItem('concord:notifications', 'on');
    const shown: { title: string; body: string; tag: string; closed: boolean }[] = [];
    (window as unknown as { shownNotifications: typeof shown }).shownNotifications = shown;
    class Recorder {
      static permission = 'granted';
      static requestPermission = async () => 'granted';
      onclick: (() => void) | null = null;
      private readonly entry: (typeof shown)[number];
      constructor(title: string, o: { body?: string; tag?: string } = {}) { this.entry = { title, body: o.body ?? '', tag: o.tag ?? '', closed: false }; shown.push(this.entry); }
      close() { this.entry.closed = true; }
    }
    Object.defineProperty(window, 'Notification', { value: Recorder });
  });
  const page = await context.newPage();
  const problems = watch(page);
  if (process.env.VOICE_LOG) page.on('console', (m) => console.error(`[${handle}] ${m.type()} ${m.text().slice(0, 300)}`));
  if (process.env.VOICE_LOG) page.on('response', (r) => { if (r.url().includes('join_call')) console.error(`[${handle}] ${r.status()} ${r.url()}`); });
  if (process.env.VOICE_LOG) page.on('websocket', (ws) => { console.error(`[${handle}] websocket ${ws.url().slice(0, 80)}`); ws.on('close', () => console.error(`[${handle}] closed ${ws.url().slice(0, 60)}`)); });
  page.on('websocket', (ws) => {
    if (!ws.url().includes('/ws?')) return;
    ws.on('framereceived', ({ payload }) => {
      const log = (f: Record<string, unknown>) => {
        if (f.type === 'Bulk') return void (f.v as Record<string, unknown>[]).forEach(log);
        if (typeof f.type !== 'string' || !/^Voice(CallUpdate|ChannelJoin|ChannelLeave)$/.test(f.type)) return;
        const { type, ...rest } = f;
        const who = (rest.state as { id?: string } | undefined)?.id ?? rest.user ?? rest.initiator_id;
        frames.push(`${clock()} ms  ${handle.padEnd(6)} ${String(type).padEnd(17)} ${JSON.stringify({ ...rest, state: undefined, who: name(String(who)) })}`);
      };
      try { log(JSON.parse(String(payload)) as Record<string, unknown>); } catch { /* not JSON */ }
    });
  });
  await signIn(page, handle);
  await page.goto(`${APP}/channels/@me`);
  await page.getByText('Connected').waitFor({ timeout: 15_000 }).catch(() => {});
  return { handle, page, problems };
}
const name = (id: string) => ({ [sanna.id]: 'sanna', [lauri.id]: 'lauri', [maija.id]: 'maija' })[id] ?? id;
const card = (s: Seat) => s.page.getByRole('region', { name: /^Incoming call from / });
const panelText = (s: Seat, text: string) => s.page.getByRole('region', { name: 'Voice call' }).getByText(text, { exact: true });
/** Open a DM or group from the sidebar, without reloading the app. */
async function openChannel(s: Seat, id: string) {
  if (s.page.url().endsWith(`/channels/@me/${id}`)) return;
  await s.page.locator(`nav[aria-label="Direct messages"] a[href$="/${id}"]`).click();
  await s.page.waitForURL(`**/channels/@me/${id}`);
}
const shot = async (s: Seat, label: string) => { if (out) await s.page.screenshot({ path: `${out}/dm-call-${label}-${s.handle}.png` }); };

/** sanna starts the call from the header and waits for "Calling…". Returns the ms from the click. */
async function call(a: Seat, channel: string): Promise<number> {
  await openChannel(a, channel);
  t0 = performance.now();
  mark('sanna clicks the call button');
  await a.page.getByRole('button', { name: 'Start a voice call' }).click();
  await panelText(a, 'Calling…').waitFor({ timeout: 20_000 });
  mark('sanna sees "Calling…"');
  return since();
}
async function hangUp(s: Seat) {
  mark(`${s.handle} disconnects`);
  await s.page.getByRole('region', { name: 'Voice call' }).getByRole('button', { name: 'Disconnect' }).click();
  await s.page.getByRole('region', { name: 'Voice call' }).waitFor({ state: 'detached', timeout: 5_000 });
}
/** Wait until the channel shows no one in voice to this seat, so the next call starts from empty. */
const emptied = (s: Seat, channel: string) => s.page.waitForFunction(
  (id) => !document.querySelector(`nav[aria-label="Direct messages"] a[href$="/${id}"] .call`),
  channel, { timeout: 15_000 },
);

const seats: Seat[] = [];
try {
  const [a, b, c] = await Promise.all([seat('sanna'), seat('lauri'), seat('maija')]);
  seats.push(a, b, c);

  // 1. A call that lauri ignores.
  mark('DM call 1: lauri ignores');
  const connected1 = await call(a, dm);
  const ring1 = await passes(card(b).waitFor({ timeout: 10_000 }));
  const shown1 = since();
  mark("lauri's card shows");
  check(ring1 && shown1 - connected1 <= 2_000, `lauri's ringing card shows within 2 s of sanna connecting (${shown1 - connected1} ms; ${shown1} ms from the click)`);
  await shot(b, 'ringing');
  await shot(a, 'calling');
  await card(b).getByRole('button', { name: 'Ignore' }).click();
  const gone1 = await passes(card(b).waitFor({ state: 'detached', timeout: 1_000 }));
  await b.page.waitForTimeout(3_000);
  check(gone1 && !(await card(b).isVisible()), 'Ignore stops the ring, and it stays stopped');
  await hangUp(a);
  await emptied(b, dm).catch(() => {});

  // 2. A call that ends before lauri answers.
  mark('DM call 2: sanna leaves');
  const connected2 = await call(a, dm);
  const ring2 = await passes(card(b).waitFor({ timeout: 10_000 }));
  check(ring2, `a second call rings again (${since() - connected2} ms after sanna connected)`);
  t0 = performance.now();
  await hangUp(a);
  const cleared = await passes(card(b).waitFor({ state: 'detached', timeout: 10_000 }));
  check(cleared, `sanna leaving clears lauri's card (${since()} ms after the click)`);
  await emptied(b, dm).catch(() => {});

  // 3. A call nobody answers, while lauri's tab is hidden: it notifies, and stops after 30 s.
  mark('DM call 3: no answer, lauri hidden');
  await b.page.evaluate(() => Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true }));
  await call(a, dm);
  await card(b).waitFor({ timeout: 10_000 });
  const heard = since();
  const notes = () => b.page.evaluate(() => (window as unknown as { shownNotifications: { title: string; body: string; tag: string; closed: boolean }[] }).shownNotifications);
  const note = (await notes()).at(-1);
  check(!!note && note.body === 'Calling you…' && note.tag === `call:${dm}` && !note.closed, `the hidden tab notifies (${note ? `${note.title}: ${note.body}` : 'none'})`);
  await b.page.waitForTimeout(Math.max(0, 28_500 - (since() - heard)));
  check(await card(b).isVisible(), 'it still rings at 28.5 s');
  const rungOut = await passes(card(b).waitFor({ state: 'detached', timeout: 4_000 }));
  check(rungOut, `it stops by itself after 30 s (${since() - heard} ms after it showed)`);
  check(!!(await notes()).at(-1)?.closed, 'and its notification closes');
  mark('lauri rings out');
  await b.page.evaluate(() => Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true }));
  await hangUp(a);
  await emptied(b, dm).catch(() => {});

  // 4. A call that lauri joins from the card.
  mark('DM call 4: lauri joins');
  const connected3 = await call(a, dm);
  await card(b).waitFor({ timeout: 10_000 });
  check(true, `the third call rings (${since() - connected3} ms after sanna connected)`);
  mark('lauri clicks Join');
  await card(b).getByRole('button', { name: 'Join' }).click();
  const both = await passes(Promise.all([panelText(a, 'Voice connected').waitFor({ timeout: 20_000 }), panelText(b, 'Voice connected').waitFor({ timeout: 20_000 })]));
  check(both, `lauri joining connects both: both see "Voice connected" (${since()} ms from sanna's click)`);
  check(b.page.url().endsWith(`/channels/@me/${dm}`), 'joining from the card opens the DM');
  check(!(await card(b).isVisible()), 'the card is gone once lauri is in the call');
  await shot(a, 'connected');
  await hangUp(b);
  await hangUp(a);
  await emptied(c, group).catch(() => {});

  // 5. The group: both others ring; lauri joins from the card, maija ignores and joins from call_started.
  mark('group call');
  await openChannel(c, group);
  const connected4 = await call(a, group);
  const rings4 = await passes(Promise.all([card(b).waitFor({ timeout: 10_000 }), card(c).waitFor({ timeout: 10_000 })]));
  const shown4 = since();
  check(rings4 && shown4 - connected4 <= 2_000, `in the group, both lauri and maija ring within 2 s (${shown4 - connected4} ms)`);
  const where = await card(c).textContent();
  check(!!where?.includes(GROUP), `maija's card names the group (${where?.trim() ?? ''})`);
  mark('lauri clicks Join');
  await card(b).getByRole('button', { name: 'Join' }).click();
  const two = await passes(Promise.all([panelText(a, 'Voice connected').waitFor({ timeout: 20_000 }), panelText(b, 'Voice connected').waitFor({ timeout: 20_000 })]));
  check(two, 'lauri joins the group call from the card: both see "Voice connected"');
  check(await card(c).isVisible(), "maija's card keeps ringing while the others talk");
  await card(c).getByRole('button', { name: 'Ignore' }).click();
  const join = c.page.locator('.system', { hasText: 'started a call' }).last().getByRole('button', { name: 'Join call' });
  const offered = await passes(join.waitFor({ timeout: 5_000 }));
  check(offered, "the group's call_started line offers Join while the call runs");
  mark('maija clicks Join on the call_started line');
  if (offered) await join.click();
  const three = await passes(panelText(c, 'Voice connected').waitFor({ timeout: 20_000 }));
  check(three, 'maija joins from the call_started line and sees "Voice connected"');
  await shot(c, 'group');
  for (const s of [c, b, a]) await hangUp(s).catch(() => {});
  const over = await passes(join.waitFor({ state: 'detached', timeout: 10_000 }));
  check(over, 'the Join on call_started goes once the call is over');

  // The call ended from the other side logs LiveKit's own warning while it closes; that one is expected.
  const problems = seats.flatMap((s) => [...s.problems.failed, ...s.problems.console].map((p) => `${s.handle}: ${p}`))
    .filter((p) => !p.includes('createOffer with closed peer connection'));
  check(problems.length === 0, `no failed requests or console errors${problems.length ? `: ${problems.slice(0, 6).join('; ')}` : ''}`);
} catch (e) {
  failures.push(String(e));
  console.log(`FAIL ${String(e).split('\n')[0]}`);
  for (const s of seats) {
    await shot(s, 'failed').catch(() => {});
    console.log(`  ${s.handle}: ${[...s.problems.failed, ...s.problems.console].slice(0, 5).join('; ') || 'no problems logged'}`);
  }
} finally {
  // Only seats still in a call, so a clean run doesn't wait out the click's timeout.
  for (const s of seats) if (await s.page.getByRole('region', { name: 'Voice call' }).isVisible().catch(() => false)) await hangUp(s).catch(() => {});
  await browser.close();
}
console.log('\nStoat frames and what the browsers did, ms since the run began:');
for (const f of frames) console.log(f);
console.log(failures.length ? `dm-call: ${failures.length} failed` : 'dm-call: all passed');
process.exit(failures.length ? 1 : 0);
