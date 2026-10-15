/**
 * The call view (m4-plan.md task 6), on the local dev stack: `ben`, `eetu` and `emma` in Olohuone with Chromium's
 * fake microphone and camera. Ben turns his camera on. Checks:
 * - before joining, emma's call view lists who is in Olohuone and offers Join,
 * - each of the three sees three tiles, and the others see ben's camera playing,
 * - a volume set in eetu's participant menu for ben is still there after a reload, in the sidebar's menu.
 * Review screenshots: the lobby, the grid with the camera, a focused tile, the chat panel and the menu.
 * Usage: node tools/live/src/callview.ts [screenshot-dir]
 */
import type { Browser, Page } from 'playwright-core';
import { chromium } from 'playwright-core';
import { loadState } from '../../seed/src/config.ts';
import { assertDevStack } from '../../seed/src/vps.ts';
import { APP, watch } from './browser.ts';
import { signIn } from './login.ts';

// Joins calls as seeded personas: never against production.
await assertDevStack();
const st = loadState()!;
const out = process.argv[2];
const failures: string[] = [];
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failures.push(what); };
const passes = (p: Promise<unknown>) => p.then(() => true, () => false);
const OLOHUONE = `${APP}/channels/${st.serverId}/${st.channels.olohuone}`;

const browser: Browser = await chromium.launch({
  headless: true,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});

interface Seat { page: Page; problems: ReturnType<typeof watch> }
async function seat(handle: string): Promise<Seat> {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, permissions: ['microphone', 'camera'] });
  const page = await context.newPage();
  const s: Seat = { page, problems: watch(page) };
  if (process.env.VOICE_LOG) page.on('console', (msg) => console.error(`[${handle}] ${msg.type()} ${msg.text().slice(0, 300)}`));
  await signIn(page, handle);
  return s;
}
const shot = async (p: Page, name: string) => { if (out) await p.screenshot({ path: `${out}/call-${name}.png` }); };
const call = (p: Page) => p.getByRole('region', { name: 'Call in Olohuone' });
const tiles = (p: Page) => call(p).locator('.tile');
const tile = (p: Page, name: RegExp) => call(p).getByRole('button', { name });
async function joinFromSidebar(s: Seat) {
  await s.page.goto(`${APP}/channels/${st.serverId}/${st.channels.yleinen}`);
  await s.page.getByRole('link', { name: /^Olohuone/ }).click();
  await s.page.getByText('Voice connected').waitFor({ timeout: 20_000 });
}
/** Whether a tile's video element is playing frames. */
const playing = (p: Page, name: RegExp) => tile(p, name).first().evaluate((hit) => {
  const v = hit.parentElement?.querySelector('video');
  return !!v && v.videoWidth > 0 && !v.paused;
});

const seats: Seat[] = [];
try {
  const [ben, eetu, emma] = await Promise.all([seat('ben'), seat('eetu'), seat('emma')]);
  seats.push(ben, eetu, emma);
  await joinFromSidebar(ben);
  await ben.page.getByRole('toolbar', { name: 'Call controls' }).getByRole('button', { name: 'Turn on camera' }).click();
  await joinFromSidebar(eetu);

  // Emma opens Olohuone by its address, which doesn't join: the lobby.
  await emma.page.goto(OLOHUONE);
  const lobby = await passes(call(emma.page).getByText('2 people are in this channel.').waitFor({ timeout: 10_000 }));
  check(lobby, "emma's call view lists the two in Olohuone before she joins");
  await shot(emma.page, 'lobby');
  await call(emma.page).getByRole('button', { name: 'Join voice' }).click();
  await emma.page.getByText('Voice connected').waitFor({ timeout: 20_000 });

  const three = await passes(Promise.all(seats.map((s) => tiles(s.page).nth(2).waitFor({ timeout: 10_000 }))));
  check(three, 'each of the three sees three tiles');
  let camera = false;
  for (let i = 0; i < 20 && !camera; i++) {
    camera = (await playing(eetu.page, /^Ben Carter/).catch(() => false)) && (await playing(emma.page, /^Ben Carter/).catch(() => false));
    if (!camera) await eetu.page.waitForTimeout(500);
  }
  check(camera, "eetu and emma see ben's camera playing in his tile");
  // Emma mutes, so the grid shows a mute icon.
  await call(emma.page).getByRole('button', { name: 'Mute', exact: true }).click();
  await eetu.page.waitForTimeout(2000);
  await shot(eetu.page, 'grid');
  await shot(ben.page, 'grid-sharer');

  await tile(eetu.page, /^Ben Carter/).first().click();
  await eetu.page.waitForTimeout(800);
  await shot(eetu.page, 'focused');
  await tile(eetu.page, /^Ben Carter/).first().click();

  await eetu.page.getByRole('button', { name: 'Show chat' }).click();
  await eetu.page.getByRole('region', { name: 'Chat in Olohuone' }).or(eetu.page.getByRole('heading', { name: 'Chat in Olohuone' })).first().waitFor({ timeout: 5_000 });
  await eetu.page.waitForTimeout(800);
  await shot(eetu.page, 'chat');
  await eetu.page.getByRole('button', { name: 'Hide chat' }).first().click();

  // The participant menu: ben to 60 % for eetu (headless Chromium's user agent says HeadlessChrome, so it gets the 100 % ceiling).
  await tile(eetu.page, /^Ben Carter/).first().click({ button: 'right' });
  const slider = eetu.page.getByRole('menu').getByRole('slider');
  await slider.fill('60');
  await eetu.page.waitForTimeout(400);
  await shot(eetu.page, 'menu');
  await eetu.page.keyboard.press('Escape');
  await eetu.page.reload();
  // A reload doesn't rejoin: ben's row in the sidebar has the same menu.
  const row = eetu.page.getByRole('list', { name: 'In Olohuone' }).getByRole('button', { name: /^Ben Carter/ });
  await row.waitFor({ timeout: 15_000 });
  await row.click({ button: 'right' });
  const after = await eetu.page.getByRole('menu').getByRole('slider').inputValue().catch(() => 'none');
  check(after === '60', `ben's volume for eetu survives a reload (${after})`);
  await eetu.page.keyboard.press('Escape');
  // Back to 100 %, so later runs start clean.
  await row.click({ button: 'right' });
  await eetu.page.getByRole('menu').getByRole('slider').fill('100');
  await eetu.page.keyboard.press('Escape');

  for (const s of [ben, emma]) await s.page.getByRole('button', { name: 'Disconnect' }).first().click();
  // LiveKit warns while a call it is closing renegotiates; that one is expected.
  const problems = seats.flatMap((s) => [...s.problems.failed, ...s.problems.console]).filter((p) => !p.includes('createOffer with closed peer connection'));
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
console.log(failures.length ? `callview: ${failures.length} failed` : 'callview: all passed');
process.exit(failures.length ? 1 : 0);
