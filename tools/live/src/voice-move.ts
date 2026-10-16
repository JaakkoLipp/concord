/**
 * m4.7-plan.md task 2 on the local dev stack, on a throwaway server (probe-moderation.ts's `setup`): `onni`, a
 * Moderator, moves `tuuli` between the voice channels Alpha and Beta over the API while `dev` watches the sidebar.
 * - One move: her call follows without a click, sends audio within 3 s, and makes no extra join_call.
 * - Two moves in quick succession: the call ends in the channel of the last one.
 * - Muted and deafened before a move: still muted and deafened after, and sending nothing.
 * - A move made while her connection is cut: the call follows once it is back.
 * Each scenario gets a fresh browser, since a second call in the same one can stall on the local stack
 * (m4.7-results.md). Usage: node tools/live/src/voice-move.ts
 */
import type { Page } from 'playwright-core';
import { assertDevStack } from '../../seed/src/vps.ts';
import { APP } from './browser.ts';
import { dock, inChannel, join, passes, seat, sending, voiceBrowser, type Seat } from './calls.ts';
import { answer, cleanup, setup } from './probe-moderation.ts';

await assertDevStack();
const failures: string[] = [];
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failures.push(what); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const p = await setup();
const move = (to: string) => p.mod.call('PATCH', `/servers/${p.server}/members/${p.target.id}`, { voice_channel: to });
const open = async (browser: Awaited<ReturnType<typeof voiceBrowser>>, handle: string): Promise<Seat> => {
  const s = await seat(browser, handle);
  await s.page.goto(`${APP}/channels/${p.server}/${p.text}`, { waitUntil: 'networkidle' });
  return s;
};
/** Whether tuuli is listed in a channel for this page, waiting up to `ms`. */
const listed = (page: Page, channel: string, ms = 8_000) => passes(inChannel(page, channel).getByRole('listitem').filter({ hasText: 'tuuli' }).waitFor({ timeout: ms }));
const connected = (s: Seat, ms = 8_000) => passes(s.page.getByText('Voice connected').waitFor({ timeout: ms }));
const heading = (s: Seat) => s.page.locator('section[aria-label="Voice call"]').innerText().then((t) => t.replace(/\s+/g, ' '), () => '');
const panelIn = async (s: Seat, channel: string) => (await heading(s)).includes(channel);

let browser = await voiceBrowser();
try {
  // 1. One move.
  {
    const tuuli = await open(browser, 'tuuli');
    const dev = await open(browser, 'dev');
    await join(tuuli, 'Alpha');
    await sleep(2_000);
    const joins = tuuli.joins;
    const at = Date.now();
    await move(p.voiceB);
    const followed = await connected(tuuli) && await panelIn(tuuli, 'Beta');
    const seen = await listed(dev.page, 'Beta');
    const rate = await sending(tuuli.page);
    check(followed && seen, `a move to Beta is followed without a click, in ${Date.now() - at} ms, and dev sees her in Beta`);
    check(rate > 3_000, `she sends audio after the move: ${rate} B/s`);
    check(tuuli.joins === joins, `no extra join_call: ${tuuli.joins - joins}`);
    check(!(await inChannel(dev.page, 'Alpha').getByRole('listitem').filter({ hasText: 'tuuli' }).count()), 'she is no longer listed in Alpha');
    const toast = await passes(tuuli.page.getByText('You were moved to Beta.').waitFor({ timeout: 3_000 }));
    check(toast, 'a toast says where she was moved');
    check(!(await heading(tuuli)).includes('Disconnected'), 'the panel never ends in "Disconnected"');
  }

  // 2. Moves in quick succession. A second move sent before the first has connected is refused by Stoat (500, the
  // target has left the old room already), so it is tried once to record that; the real case is back to back.
  await browser.close();
  browser = await voiceBrowser();
  {
    const tuuli = await open(browser, 'tuuli');
    const dev = await open(browser, 'dev');
    await join(tuuli, 'Alpha');
    await sleep(2_000);
    const joins = tuuli.joins;
    const [first, second] = await Promise.all([answer(move(p.voiceB)), answer(move(p.voiceA))]);
    console.log(`     concurrent moves answered: ${first} / ${second}`);
    check(await connected(tuuli, 10_000) && await passes(inChannel(dev.page, 'Beta').getByRole('listitem').filter({ hasText: 'tuuli' }).waitFor({ timeout: 8_000 })), 'two moves sent together: the call follows the one Stoat accepted');
    // Back to back: each move sent as soon as she is connected in the last place.
    for (const [name, id] of [['Alpha', p.voiceA], ['Beta', p.voiceB]] as const) {
      await move(id);
      check(await connected(tuuli, 10_000) && await panelIn(tuuli, name) && await listed(dev.page, name), `a move to ${name} straight after the last is followed`);
    }
    check(await sending(tuuli.page) > 3_000, 'and she sends audio');
    check(tuuli.joins === joins, `no join_call in any of them: ${tuuli.joins - joins}`);
  }

  // 3. Muted and deafened before the move.
  await browser.close();
  browser = await voiceBrowser();
  {
    const tuuli = await open(browser, 'tuuli');
    await join(tuuli, 'Alpha');
    await dock(tuuli.page).getByRole('button', { name: 'Mute', exact: true }).click();
    await dock(tuuli.page).getByRole('button', { name: 'Deafen', exact: true }).click();
    await move(p.voiceB);
    await connected(tuuli);
    await sleep(1_500);
    const stillMuted = await dock(tuuli.page).getByRole('button', { name: 'Unmute', exact: true }).count();
    const stillDeaf = await dock(tuuli.page).getByRole('button', { name: 'Undeafen', exact: true }).count();
    const rate = await sending(tuuli.page);
    check(stillMuted > 0 && stillDeaf > 0 && rate < 3_000 && await panelIn(tuuli, 'Beta'), `mute and deafen survive a move, and she sends ${rate} B/s`);
  }

  // 4. A move while her connection is cut: Stoat's event is held until the network is back.
  await browser.close();
  browser = await voiceBrowser();
  {
    const tuuli = await open(browser, 'tuuli');
    const dev = await open(browser, 'dev');
    await join(tuuli, 'Alpha');
    await sleep(2_000);
    await tuuli.page.context().setOffline(true);
    await sleep(1_000);
    await move(p.voiceB);
    await sleep(1_500);
    await tuuli.page.context().setOffline(false);
    let followed = false;
    for (const end = Date.now() + 25_000; Date.now() < end && !followed; await sleep(500)) followed = (await panelIn(tuuli, 'Beta')) && (await heading(tuuli)).includes('Voice connected');
    const seen = await listed(dev.page, 'Beta', 15_000);
    check(followed && seen, `a move made while her connection was cut is followed when it returns (call ${followed ? 'in Beta' : JSON.stringify(await heading(tuuli))}, dev sees her in Beta: ${seen})`);
    check(await sending(tuuli.page) > 3_000, 'and she sends audio again');
  }
} finally {
  await browser.close().catch(() => {});
  await cleanup(p);
}
if (failures.length) { console.error(`\n${failures.length} failed`); process.exit(1); }
console.log('\nall passed');
