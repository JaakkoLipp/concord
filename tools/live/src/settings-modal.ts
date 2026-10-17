/**
 * Settings over a mounted shell (m4.6-plan.md task 16a) on the local dev stack, clicking through the UI: `dev-admin`
 * joins Olohuone with the fake microphone, goes to #yleinen and scrolls up, then:
 * - opens user, server and channel settings from the gear, the server menu and the channel's menu, and on each
 *   close finds the same voice panel and conversation elements, at the same scroll position, with focus back on the opener,
 * - closes with Esc, Back and the X; Esc first closes a menu open inside settings,
 * - Tab never reaches the inert shell, Ctrl+E opens no picker and Ctrl+Shift+M doesn't mute under settings,
 * - records Ctrl+Shift+M as a keybind in Voice and video without muting,
 * - edits the server's name, presses Back and gets the unsaved-changes question; Cancel keeps settings, Leave closes,
 * - a reload at a settings URL reopens it over a channel, and Back then closes it; at phone width it fills the screen,
 * - Log out from Profile reaches the login page without a page error.
 * Usage: node tools/live/src/settings-modal.ts [screenshot-dir]
 */
import type { Locator, Page } from 'playwright-core';
import { loadState } from '../../seed/src/config.ts';
import { assertDevStack } from '../../seed/src/vps.ts';
import { APP } from './browser.ts';
import { dock, join, passes, seat as newSeat, voiceBrowser, type Seat } from './calls.ts';

await assertDevStack();
const st = loadState()!;
const out = process.argv[2];
const failures: string[] = [];
const check = (ok: boolean, what: string, detail?: unknown) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail === undefined ? '' : ` ${JSON.stringify(detail)}`}`);
  if (!ok) failures.push(what);
};
const browser = await voiceBrowser();
let s: Seat | null = null;

/** Marks the voice panel and the message scroller, so a close can tell they are the same elements, and notes the scroll. */
async function mark(page: Page): Promise<number> {
  return page.evaluate(() => {
    const w = window as unknown as { __kept: Element[] };
    w.__kept = [document.querySelector('section[aria-label="Voice call"]')!, document.querySelector('.main .scroller')!];
    return w.__kept[1]!.scrollTop;
  });
}
async function kept(page: Page, scroll: number, what: string) {
  const same = await page.evaluate(() => {
    const w = window as unknown as { __kept: Element[] };
    const [voice, scroller] = w.__kept;
    return { voice: !!voice?.isConnected && document.querySelector('section[aria-label="Voice call"]') === voice,
      scroller: !!scroller?.isConnected && document.querySelector('.main .scroller') === scroller, scroll: scroller?.scrollTop ?? -1 };
  });
  check(same.voice && same.scroller && Math.abs(same.scroll - scroll) <= 1, `${what}: the same voice panel and conversation, scrolled where they were`, same);
}
const settings = (page: Page) => page.locator('.settings[role="dialog"]');
const opened = (page: Page) => passes(settings(page).waitFor({ timeout: 5_000 }));
const closed = (page: Page) => passes(settings(page).waitFor({ state: 'detached', timeout: 5_000 }));
const focusedLabel = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent?.trim() ?? '');
async function openMenuItem(page: Page, opener: Locator, ...items: string[]) {
  await opener.click();
  for (const item of items) await page.getByRole('menuitem', { name: item, exact: true }).click();
}

try {
  s = await newSeat(browser, 'dev-admin');
  const page = s.page;
  await join(s, 'Olohuone');
  await page.getByRole('link', { name: /^yleinen/ }).click();
  await page.waitForURL(new RegExp(`/channels/${st.serverId}/${st.channels.yleinen}$`));
  const scroller = page.locator('.main .scroller');
  await scroller.waitFor();
  await page.waitForTimeout(1_000);
  await scroller.evaluate((el) => { el.scrollTop = el.scrollHeight - el.clientHeight - 600; });
  await page.waitForTimeout(500);
  const scroll = await mark(page);
  check(scroll > 0, `the conversation is scrolled up from the bottom (${scroll} px)`);
  const channelUrl = page.url();
  const serverName = (await page.locator('.header-button').getAttribute('aria-label'))!.replace(/ menu$/, '');

  // 1. User settings from the gear, closed with Esc. Tab stays inside, and the shell's keys wait.
  const gear = dock(page).getByRole('button', { name: 'User settings', exact: true });
  await gear.click();
  check(await opened(page) && page.url().endsWith('/settings/profile'), 'the gear opens user settings at its URL');
  check(await page.locator('.shell').evaluate((el) => (el as HTMLElement).inert), 'the shell is inert under settings');
  let escaped = false;
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('Tab');
    if (await page.evaluate(() => !!document.activeElement?.closest('.shell'))) escaped = true;
  }
  check(!escaped, 'Tab never reaches the shell');
  await page.keyboard.press('Control+KeyE');
  await page.keyboard.press('Control+Shift+KeyM');
  await page.waitForTimeout(300);
  check(await page.locator('.popover').count() === 0, 'Ctrl+E opens no emoji picker under settings');
  check(await dock(page).getByRole('button', { name: 'Mute', exact: true }).count() > 0, 'Ctrl+Shift+M doesn’t mute under settings');
  if (out) await page.screenshot({ path: `${out}/settings-modal-user.png` });
  await page.keyboard.press('Escape');
  check(await closed(page) && page.url() === channelUrl, 'Esc closes it, back at the channel URL');
  await kept(page, scroll, 'user settings');
  check(await focusedLabel(page) === 'User settings', 'focus is back on the gear', await focusedLabel(page));

  // 2. Server settings from the server menu, closed with Back.
  const header = page.getByRole('button', { name: `${serverName} menu` });
  await openMenuItem(page, header, 'Server settings', 'Overview');
  check(await opened(page) && /\/server-settings\/[0-9A-Z]{26}\/overview$/.test(page.url()), 'the server menu opens server settings at its URL');
  await page.goBack();
  check(await closed(page) && page.url() === channelUrl, 'Back closes it');
  await kept(page, scroll, 'server settings');
  check(await focusedLabel(page) === `${serverName} menu`, 'focus is back on the server menu’s button', await focusedLabel(page));

  // 3. Channel settings from the channel's menu, closed with the X.
  await page.getByRole('link', { name: /^yleinen/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Edit channel', exact: true }).click();
  check(await opened(page) && /\/channel-settings\/[0-9A-Z]{26}\/overview$/.test(page.url()), 'Edit channel opens channel settings at its URL');
  await settings(page).getByRole('button', { name: 'Close', exact: true }).click();
  check(await closed(page) && page.url() === channelUrl, 'the X closes it');
  await kept(page, scroll, 'channel settings');

  // 4. Esc closes a menu inside settings first.
  await openMenuItem(page, header, 'Server settings', 'Members');
  await opened(page);
  // The member list fills in as members load: let it settle before picking a row.
  await settings(page).locator('.member .icon-button').first().waitFor();
  await page.waitForTimeout(1_500);
  await settings(page).locator('.member .icon-button').first().click();
  const menuShown = await passes(page.locator('[role="menu"]').waitFor({ timeout: 3_000 }));
  await page.keyboard.press('Escape');
  const menuGone = await passes(page.locator('[role="menu"]').waitFor({ state: 'detached', timeout: 3_000 }));
  check(menuShown && menuGone && await settings(page).isVisible(), 'Esc closes the open menu and leaves settings open', { menuShown, menuGone, url: page.url() });
  await page.keyboard.press('Escape');
  check(await closed(page), 'a second Esc closes settings');

  // 5. Unsaved changes: Back asks, Cancel keeps settings open, Leave closes it.
  await openMenuItem(page, header, 'Server settings', 'Overview');
  await opened(page);
  await settings(page).getByLabel('Server name').fill(`${serverName} muutettu`);
  await page.goBack();
  const asked = page.getByRole('dialog', { name: 'Leave without saving?' });
  check(await passes(asked.waitFor({ timeout: 3_000 })) && /\/server-settings\//.test(page.url()), 'Back with unsaved changes asks, and settings stays',
    { url: page.url(), open: await settings(page).count(), dialogs: await page.locator('dialog[open] h2').allInnerTexts() });
  await asked.getByRole('button', { name: 'Cancel' }).click();
  await page.waitForTimeout(300);
  check(await settings(page).isVisible() && await settings(page).getByLabel('Server name').inputValue() === `${serverName} muutettu`, 'Cancel keeps the edit open');
  await page.goBack();
  await asked.waitFor({ timeout: 3_000 });
  await asked.getByRole('button', { name: 'Leave' }).click();
  check(await closed(page) && page.url() === channelUrl, 'Leave closes settings without saving');
  await kept(page, scroll, 'after the unsaved-changes question');

  // 6. Recording Ctrl+Shift+M as the mute keybind doesn't mute.
  await gear.click();
  await opened(page);
  await settings(page).getByRole('link', { name: 'Voice and video' }).click();
  check(page.url().endsWith('/settings/voice'), 'a section switch keeps settings open at the section’s URL');
  const muteRow = page.locator('.field', { hasText: 'Toggle mute' });
  await muteRow.getByRole('button', { name: 'Record key' }).click();
  await page.keyboard.press('Control+Shift+KeyM');
  await page.waitForTimeout(500);
  check((await muteRow.locator('kbd').textContent())?.trim() === 'Ctrl + Shift + M' && await dock(page).getByRole('button', { name: 'Mute', exact: true }).count() > 0,
    'recording Ctrl+Shift+M sets the keybind without muting');

  // 7. A reload at a settings URL reopens it over a channel, and Back closes it.
  await page.reload({ waitUntil: 'networkidle' });
  check(await opened(page) && page.url().endsWith('/settings/voice') && await page.locator('.shell').count() === 1, 'a reload reopens settings over the shell');
  await page.goBack();
  check(await closed(page) && /\/channels\//.test(page.url()), 'Back after a reload closes settings into a channel', page.url());

  // 8. Phone width: full screen.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${APP}/settings/notifications`, { waitUntil: 'networkidle' });
  await opened(page);
  const box = await settings(page).boundingBox();
  check(!!box && box.x === 0 && box.y === 0 && box.width === 390 && box.height === 844, 'at phone width settings fills the screen', box);
  if (out) await page.screenshot({ path: `${out}/settings-modal-phone.png` });
  // 9. Log out from Profile: the modal goes first, so the editor never reads a missing account.
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(`${APP}/settings/profile`, { waitUntil: 'networkidle' });
  await opened(page);
  await settings(page).getByRole('button', { name: 'Log out', exact: true }).click();
  check(await passes(page.waitForURL(/\/app\/login/, { timeout: 10_000 })), 'Log out from settings reaches the login page');
  await page.waitForTimeout(1_000);
  check(!s.problems.console.some((l) => l.startsWith('pageerror')), 'no page errors', s.problems.console.filter((l) => l.startsWith('pageerror')));
} finally {
  await browser.close();
}
console.log(failures.length ? `settings-modal: ${failures.length} failed` : 'settings-modal: all passed');
process.exit(failures.length ? 1 : 0);
