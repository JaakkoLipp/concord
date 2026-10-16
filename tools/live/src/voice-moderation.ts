/**
 * m4.7-plan.md task 3 on the local dev stack, on a throwaway server (probe-moderation.ts's `setup`), in browsers:
 * `onni`, a Moderator, moderates `tuuli` in a call, and `dev`, a plain member, watches.
 * - Dragging tuuli's row onto another voice channel moves her; "Move to" does the same from the keyboard.
 * - Server mute: her audio falls to near zero, dev sees the mark, her mute button is locked; unmuting brings it back.
 * - Server deafen: what she hears stops and returns.
 * - A server mute from a moderator who is in another call is not reported as a failure, though Stoat answers 500.
 * - dev sees no moderation items in tuuli's menu.
 * Each scenario gets a fresh browser, since a second call in the same one can stall on the local stack
 * (m4.7-results.md). Usage: node tools/live/src/voice-moderation.ts
 */
import type { Page } from 'playwright-core';
import { assertDevStack } from '../../seed/src/vps.ts';
import { APP } from './browser.ts';
import { dock, inChannel, join, passes, receiving, seat, sending, voiceBrowser, type Seat } from './calls.ts';
import { participants } from './livekit-admin.ts';
import { cleanup, setup } from './probe-moderation.ts';

await assertDevStack();
const failures: string[] = [];
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failures.push(what); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const p = await setup();
let browser = await voiceBrowser();
const open = async (handle: string): Promise<Seat> => {
  const s = await seat(browser, handle);
  await s.page.goto(`${APP}/channels/${p.server}/${p.text}`, { waitUntil: 'networkidle' });
  return s;
};
const row = (page: Page, channel: string, who = /^tuuli/) => inChannel(page, channel).getByRole('button', { name: who });
const panel = (s: Seat) => s.page.locator('section[aria-label="Voice call"]').innerText().then((t) => t.replace(/\s+/g, ' '), () => '');
/** Waits for the call panel to name a channel: a move happens after the drop, so it isn't there yet. */
async function panelHas(s: Seat, channel: string, ms = 12_000): Promise<boolean> {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(250)) if ((await panel(s)).includes(channel) && (await panel(s)).includes('Voice connected')) return true;
  return false;
}
const menu = (page: Page) => page.getByRole('menu');
const items = (page: Page) => menu(page).getByRole('menuitem').or(menu(page).getByRole('menuitemcheckbox')).allInnerTexts();
const fresh = async () => { await browser.close(); browser = await voiceBrowser(); };
const toastTexts = (page: Page) => page.getByRole('status').allInnerTexts().catch(() => [] as string[]);

try {
  // 1. Moving: dragging, then "Move to" from the keyboard.
  {
    const mod = await open('onni');
    const tuuli = await open('tuuli');
    const dev = await open('dev');
    await join(tuuli, 'Alpha');
    await row(mod.page, 'Alpha').waitFor({ timeout: 10_000 });
    const joins = tuuli.joins;

    // Only allowed channels light up: both voice channels are, while the text channel is not a destination.
    const handle = await row(mod.page, 'Alpha').elementHandle();
    check(!!(await handle?.evaluate((el) => el.closest('li')?.getAttribute('draggable'))), 'the moderator can drag her row');
    check(!(await row(dev.page, 'Alpha').elementHandle().then((h) => h?.evaluate((el) => el.closest('li')?.getAttribute('draggable')))), 'a plain member cannot');

    await row(mod.page, 'Alpha').dragTo(mod.page.getByRole('link', { name: /^Beta/ }));
    const followed = await panelHas(tuuli, 'Beta');
    check(followed && await passes(row(dev.page, 'Beta').waitFor({ timeout: 8_000 })), 'dragging her onto Beta moves her, and everyone sees her there');
    check(tuuli.joins === joins, `and her call followed without a join_call (${tuuli.joins - joins})`);
    check(await passes(mod.page.getByText(/Moved tuuli to Beta/i).waitFor({ timeout: 5_000 })), 'the moderator is told it worked');

    // From the keyboard: focus her row, the menu key, then the "Move to Alpha" item.
    await row(mod.page, 'Beta').focus();
    await mod.page.keyboard.press('ContextMenu');
    await menu(mod.page).waitFor({ timeout: 3_000 });
    const listed = await items(mod.page);
    check(listed.includes('Move to') && !listed.includes('Move to Alpha'), `"Move to" is a submenu in the root menu: ${JSON.stringify(listed.filter((i) => /Move/.test(i)))}`);
    await menu(mod.page).getByRole('menuitem', { name: 'Move to', exact: true }).focus();
    await mod.page.keyboard.press('ArrowRight');
    const destinations = mod.page.getByRole('menu', { name: 'Move to' });
    await destinations.getByRole('menuitem', { name: 'Alpha', exact: true }).focus();
    await mod.page.keyboard.press('Enter');
    check(await panelHas(tuuli, 'Alpha') && await passes(row(dev.page, 'Alpha').waitFor({ timeout: 10_000 })), '"Move to Alpha" from the keyboard moves her back');
    check(tuuli.joins === joins, `still no join_call (${tuuli.joins - joins})`);

    // dev sees none of it.
    await row(dev.page, 'Alpha').click({ button: 'right' });
    await menu(dev.page).waitFor({ timeout: 3_000 });
    const devItems = await items(dev.page);
    check(!devItems.some((i) => /Server mute|Server deafen|Move to/.test(i)), `a plain member's menu has no moderation items: ${JSON.stringify(devItems.slice(0, 6))}`);
  }

  // 2. Server mute and deafen, with the moderator in no call, and dev talking in the room to be heard.
  await fresh();
  {
    const mod = await open('onni');
    const tuuli = await open('tuuli');
    const dev = await open('dev');
    await join(tuuli, 'Alpha');
    await join(dev, 'Alpha');
    // The shared-call controls follow the first person group, rather than preceding Profile.
    await row(dev.page, 'Alpha').click({ button: 'right' });
    const sharedText = await menu(dev.page).innerText();
    check(sharedText.indexOf('Profile') < sharedText.indexOf('User volume') && sharedText.includes('Mute for me'),
      'shared-call volume and local mute follow Profile and the main actions');
    await dev.page.keyboard.press('Escape');
    await sleep(1_500);
    const hearing = await receiving(tuuli.page);
    const toggle = async (item: string) => {
      await row(mod.page, 'Alpha').click({ button: 'right' });
      await menu(mod.page).getByRole('menuitemcheckbox', { name: item }).click();
    };

    const talkingNow = await sending(tuuli.page);
    await toggle('Server mute');
    const muted = await passes(dock(tuuli.page).getByRole('button', { name: 'Server muted' }).waitFor({ timeout: 4_000 }));
    await sleep(1_000);
    const quiet = await sending(tuuli.page);
    const stillListed = (await participants(p.voiceA)).some((x) => x.identity === p.target.id && (x.tracks ?? []).some((t) => t.source === 'MICROPHONE'));
    check(muted && !stillListed && quiet < talkingNow / 10, `server mute: her audio ${talkingNow} -> ${quiet} B/s and her button reads "Server muted"`);
    check(await passes(row(dev.page, 'Alpha').filter({ hasText: /./ }).and(dev.page.getByRole('button', { name: /tuuli.*server muted/i })).waitFor({ timeout: 3_000 })), 'dev sees the server-muted mark');
    await dock(tuuli.page).getByRole('button', { name: 'Server muted' }).click({ force: true });
    await tuuli.page.keyboard.press('Control+Shift+KeyM');
    check(await dock(tuuli.page).getByRole('button', { name: 'Server muted' }).count() > 0, 'her button and the Ctrl+Shift+M shortcut are locked');

    await toggle('Server mute');
    await dock(tuuli.page).getByRole('button', { name: 'Mute', exact: true }).waitFor({ timeout: 4_000 });
    // Her microphone opens again, which takes a moment. LiveKit's own list of her tracks is the proof: byte counts depend
    // on how long the fake microphone has played, since Chromium learns to filter it (m4.7-results.md).
    const hasMic = async () => (await participants(p.voiceA)).some((x) => x.identity === p.target.id && (x.tracks ?? []).some((t) => t.source === 'MICROPHONE'));
    const unmutedAt = Date.now();
    while (!(await hasMic()) && Date.now() - unmutedAt < 8_000) await sleep(250);
    const back = await sending(tuuli.page);
    check(await hasMic() && back > talkingNow / 4, `unmuting puts her microphone back on the call after ${Math.round((Date.now() - unmutedAt) / 1000)} s, sending ${back} B/s`);

    await toggle('Server deafen');
    const deaf = await passes(dock(tuuli.page).getByRole('button', { name: 'Server deafened' }).waitFor({ timeout: 4_000 }));
    await sleep(1_000);
    const heard = await receiving(tuuli.page);
    check(deaf && heard < hearing / 10, `server deafen: what she hears ${hearing} -> ${heard} B/s`);
    await toggle('Server deafen');
    await dock(tuuli.page).getByRole('button', { name: 'Deafen', exact: true }).waitFor({ timeout: 4_000 });
    await sleep(1_500);
    const heardAgain = await receiving(tuuli.page);
    const speaker = await sending(dev.page);
    check(heardAgain > speaker / 2, `undeafening brings it back: ${heardAgain} B/s while the speaker sends ${speaker} B/s`);
  }

  // 3. The moderator is in another call: Stoat answers 500 though the flag is stored.
  await fresh();
  {
    const mod = await open('onni');
    const tuuli = await open('tuuli');
    await join(tuuli, 'Alpha');
    await join(mod, 'Beta');
    await row(mod.page, 'Alpha').waitFor({ timeout: 10_000 });
    await row(mod.page, 'Alpha').click({ button: 'right' });
    await menu(mod.page).waitFor({ timeout: 3_000 });
    console.log('     menu with the moderator in another call:', JSON.stringify(await items(mod.page)));
    await menu(mod.page).getByRole('menuitemcheckbox', { name: 'Server mute' }).click();
    const marked = await passes(mod.page.getByRole('button', { name: /^tuuli.*server muted/i }).waitFor({ timeout: 6_000 }));
    await sleep(2_500);
    const toasts = (await toastTexts(mod.page)).join(' | ');
    check(marked && !/Couldn’t change/.test(toasts), `a 500 for a stored server mute is not reported as a failure (toasts: ${toasts || 'none'})`);
  }
} finally {
  await browser.close().catch(() => {});
  await cleanup(p);
}
if (failures.length) { console.error(`\n${failures.length} failed`); process.exit(1); }
console.log('\nall passed');
