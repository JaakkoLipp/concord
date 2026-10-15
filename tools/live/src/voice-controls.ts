/**
 * Quick voice controls (m4.5-plan.md task 4) on the local dev stack: `dev` and `aino` join the seeded Pelaamo with
 * the speech-like fake microphone (media.ts), fresh, because Chromium's audio processing learns to filter that tone
 * within a minute or so. Checks, by what aino sends and what dev sees:
 * - Ctrl+Shift+M mutes, shown in dev's sidebar, and again unmutes; Ctrl+Shift+D deafens and undeafens; a mute
 *   keybind recorded in Voice and video settings replaces it, and a plain key is refused there,
 * - the dock's microphone menu lists devices and saves a choice, and its input volume at 0 silences the call,
 * - the speaker menu has the output volume and a link to the settings,
 * - the voice panel's noise suppression toggle switches it while the call keeps sending,
 * - per-user volume (task 5): set to 40 % from the member list, it marks aino's row in the call and holds after a
 *   reload, and a stream tile's menu would offer its own volume (covered by share.ts' tiles, not here).
 * Usage: node tools/live/src/voice-controls.ts [screenshot-dir]
 */
import type { Page } from 'playwright-core';
import { assertDevStack } from '../../seed/src/vps.ts';
import { dock, inChannel, join as joinChannel, passes, seat as newSeat, sending, voiceBrowser, type Seat } from './calls.ts';

// Joins calls as seeded personas: never against production.
await assertDevStack();
const out = process.argv[2];
const failures: string[] = [];
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failures.push(what); };
const browser = await voiceBrowser();
const seat = (handle: string, voice?: Record<string, unknown>) => newSeat(browser, handle, voice);
const list = (p: Page) => inChannel(p, 'Pelaamo');
const row = (p: Page, name: RegExp) => list(p).getByRole('button', { name });
const join = (s: Seat) => joinChannel(s, 'Pelaamo');
const shot = async (p: Page, name: string) => { if (out) await p.screenshot({ path: `${out}/voice-controls-${name}.png` }); };

const seats: Seat[] = [];
try {
  const [dev, aino] = await Promise.all([seat('dev'), seat('aino')]);
  seats.push(dev, aino);
  await join(dev);
  await join(aino);
  await list(dev.page).getByRole('listitem').nth(1).waitFor({ timeout: 10_000 });
  await row(dev.page, /Aino Virtanen, speaking/).waitFor({ timeout: 15_000 });

  // Quick voice controls (m4.5-plan.md task 4).
  const unmuted = (await row(dev.page, /muted/).count()) === 0;
  const talking = await sending(aino.page);
  await aino.page.keyboard.press('Control+Shift+KeyM');
  const keyMuted = await passes(row(dev.page, /muted/).first().waitFor({ timeout: 2_000 }));
  const whileMuted = await sending(aino.page);
  check(unmuted && keyMuted && whileMuted < talking / 10, `Ctrl+Shift+M mutes: shown to dev, ${talking} B/s then ${whileMuted} B/s`);
  await aino.page.keyboard.press('Control+Shift+KeyM');
  check(await passes(dock(aino.page).getByRole('button', { name: 'Mute', exact: true }).waitFor({ timeout: 2_000 })), 'Ctrl+Shift+M again unmutes');
  await aino.page.keyboard.press('Control+Shift+KeyD');
  const deaf = await passes(dock(aino.page).getByRole('button', { name: 'Undeafen', exact: true }).waitFor({ timeout: 2_000 }));
  await aino.page.keyboard.press('Control+Shift+KeyD');
  const hearing = await passes(dock(aino.page).getByRole('button', { name: 'Deafen', exact: true }).waitFor({ timeout: 2_000 }));
  check(deaf && hearing, 'Ctrl+Shift+D deafens, and again undeafens');

  // A keybind of one's own, from Voice and video settings.
  await dock(aino.page).getByRole('button', { name: 'User settings' }).click();
  await aino.page.getByRole('link', { name: 'Voice and video' }).click();
  const muteRow = aino.page.locator('.field', { hasText: 'Toggle mute' });
  await muteRow.getByRole('button', { name: 'Record key' }).click();
  await aino.page.keyboard.press('KeyK');
  const refused = await passes(aino.page.getByText(/Hold Ctrl, Alt or Shift/).waitFor({ timeout: 2_000 }));
  await aino.page.keyboard.press('Control+Alt+KeyK');
  const shown = (await muteRow.locator('kbd').textContent())?.trim();
  check(refused && shown === 'Ctrl + Alt + K', `a plain key is refused, and Ctrl+Alt+K is recorded as the mute keybind (${shown})`);
  await aino.page.keyboard.press('Escape');
  await aino.page.keyboard.press('Control+Shift+KeyM');
  const oldIgnored = await passes(dock(aino.page).getByRole('button', { name: 'Mute', exact: true }).waitFor({ timeout: 1_000 }));
  await aino.page.keyboard.press('Control+Alt+KeyK');
  const newMutes = await passes(dock(aino.page).getByRole('button', { name: 'Unmute', exact: true }).waitFor({ timeout: 2_000 }));
  await aino.page.keyboard.press('Control+Alt+KeyK');
  const newUnmutes = await passes(dock(aino.page).getByRole('button', { name: 'Mute', exact: true }).waitFor({ timeout: 2_000 }));
  check(oldIgnored && newMutes && newUnmutes, 'the new keybind mutes and unmutes, and Ctrl+Shift+M no longer does');

  const settings = () => aino.page.evaluate(() => (JSON.parse(localStorage.getItem('concord:voice') ?? '{}') as { settings?: Record<string, unknown> }).settings ?? {});
  const setRange = (value: number) => aino.page.getByRole('menu').locator('input[type=range]').evaluate((el, v) => {
    (el as HTMLInputElement).value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  const menuOpen = () => aino.page.getByRole('menu').waitFor({ timeout: 5_000 });
  await aino.page.getByRole('button', { name: 'Microphone options' }).click();
  await menuOpen();
  const deviceItems = await aino.page.getByRole('menuitemcheckbox').count();
  await aino.page.getByRole('menuitemcheckbox').first().click();
  check(deviceItems >= 1 && (await settings()).inputDevice === '', `the microphone menu lists devices (${deviceItems}) and choosing one saves it`);
  await aino.page.getByRole('menu').waitFor({ state: 'detached' });
  await aino.page.getByRole('button', { name: 'Microphone options' }).click();
  await menuOpen();
  await setRange(0);
  await aino.page.waitForTimeout(1_000);
  const silenced = await sending(aino.page);
  await setRange(100);
  await aino.page.waitForTimeout(1_000);
  const restored = await sending(aino.page);
  await aino.page.keyboard.press('Escape');
  await aino.page.getByRole('menu').waitFor({ state: 'detached' });
  check(silenced < talking / 10 && restored > talking / 2, `the menu's input volume at 0 silences the call: ${silenced} B/s, at 100 % ${restored} B/s`);
  await aino.page.getByRole('button', { name: 'Speaker options' }).click();
  await menuOpen();
  const outputMenu = aino.page.getByRole('menu');
  const hasVolume = await outputMenu.getByText('Output volume').count() > 0 && await outputMenu.getByRole('menuitem', { name: 'Voice and video settings' }).count() > 0;
  await aino.page.keyboard.press('Escape');
  await aino.page.getByRole('menu').waitFor({ state: 'detached' });
  check(hasVolume, 'the speaker menu has the output volume and a link to the settings');

  const panel = aino.page.locator('section[aria-label="Voice call"]');
  await panel.getByRole('button', { name: 'Turn off noise suppression' }).click();
  const off = (await settings()).noiseSuppression === 'off' && await panel.getByRole('button', { name: 'Turn on noise suppression' }).count() === 1;
  const plain = await sending(aino.page);
  await panel.getByRole('button', { name: 'Turn on noise suppression' }).click();
  const on = (await settings()).noiseSuppression === 'rnnoise';
  const suppressed = await sending(aino.page);
  check(off && on && plain > talking / 2 && suppressed > talking / 2, `the panel's noise suppression toggle switches it while the call sends: ${plain} B/s off, ${suppressed} B/s on`);


  // Per-user volume from the member list (m4.5-plan.md task 5).
  // The call view has no member list: a text channel shows it, and the sidebar still lists the call.
  await dev.page.getByRole('link', { name: /^pelit/ }).click();
  const members = dev.page.getByRole('complementary', { name: 'Members' });
  await members.getByRole('button', { name: /Aino Virtanen/ }).first().click({ button: 'right' });
  const devMenu = dev.page.getByRole('menu');
  await devMenu.waitFor({ timeout: 5_000 });
  await devMenu.locator('input[type=range]').first().evaluate((el) => {
    (el as HTMLInputElement).value = '40';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await dev.page.keyboard.press('Escape');
  const marked = await passes(row(dev.page, /Aino Virtanen.*Volume 40%/).waitFor({ timeout: 3_000 }));
  check(marked, 'a volume of 40 % set in the member list marks aino in the call');
  await dev.page.reload();
  await dev.page.getByText('Voice connected').waitFor({ timeout: 20_000 }).catch(() => {});
  const kept = await passes(row(dev.page, /Aino Virtanen.*Volume 40%/).waitFor({ timeout: 15_000 }));
  await members.getByRole('button', { name: /Aino Virtanen/ }).first().click({ button: 'right' });
  await devMenu.waitFor({ timeout: 5_000 });
  const value = await devMenu.locator('input[type=range]').first().inputValue();
  await dev.page.keyboard.press('Escape');
  check(kept && value === '40', `it holds after a reload: the mark, and the menu's slider at ${value}`);
  // Back to 100 %, so later runs start clean.
  await dev.page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('concord:voice') ?? '{}') as { volumes?: Record<string, number> };
    raw.volumes = {};
    localStorage.setItem('concord:voice', JSON.stringify(raw));
  });

  for (const s of [aino, dev]) await s.page.locator('section[aria-label="Voice call"]').getByRole('button', { name: 'Disconnect' }).click().catch(() => {});
  const problems = [dev, aino].flatMap((s) => [...s.problems.failed, ...s.problems.console]);
  check(problems.length === 0, `no failed requests or console errors${problems.length ? `: ${problems.slice(0, 6).join('; ')}` : ''}`);
} catch (e) {
  failures.push(String(e));
  console.log(`FAIL ${String(e).split('\n')[0]}`);
  for (const [i, s] of seats.entries()) {
    await shot(s.page, `failed-${i}`).catch(() => {});
    console.log(`  seat ${i}: ${[...s.problems.failed, ...s.problems.console].slice(0, 5).join('; ') || 'no problems logged'}`);
  }
} finally {
  await browser.close();
}
console.log(failures.length ? `voice-controls: ${failures.length} failed` : 'voice-controls: all passed');
process.exit(failures.length ? 1 : 0);
