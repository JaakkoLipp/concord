/**
 * m4.7-plan.md task 5 on the local dev stack, on a throwaway server (probe-moderation.ts's `setup`). `dev` holds a
 * throwaway role, "Missing", that denies one permission at a time, and each place must say why, never fail with a
 * generic error:
 * - Read message history: the channel says so, and a message sent now still shows.
 * - Upload files: the "+" button's name gives the reason.
 * - Mention everyone: no @everyone suggestion, and a refused @everyone says why. With it, @everyone is suggested.
 * - Speak, Video and Listen in a call: the mute and camera buttons are locked with their reasons, a camera that is on
 *   stops, and the call says she can't hear.
 * - Connect: the voice channel shows it can't be joined, and opening it sends no join_call.
 * - A timeout ending gives back the composer, uploads and reactions without a reload.
 * - The role editor lists View audit log, a text channel's overrides have no voice permissions, the new descriptions show.
 * Usage: node tools/live/src/missing-permissions.ts
 */
import type { Page } from 'playwright-core';
import { assertDevStack } from '../../seed/src/vps.ts';
import { Permission as P } from '../../../packages/domain/src/permissions.ts';
import { APP } from './browser.ts';
import { passes, seat, voiceBrowser, type Seat } from './calls.ts';
import { cleanup, setup } from './probe-moderation.ts';

await assertDevStack();
const failures: string[] = [];
const check = (ok: boolean, what: string, actual?: unknown) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${actual === undefined ? '' : ` -> ${JSON.stringify(actual)}`}`);
  if (!ok) failures.push(what);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const p = await setup();
const browser = await voiceBrowser();
const role = (await p.owner.call<{ id: string }>('POST', `/servers/${p.server}/roles`, { name: 'Missing' })).id;
await p.owner.call('PATCH', `/servers/${p.server}/members/${p.plain.id}`, { roles: [role] });
/** The Missing role denies exactly these. Each change is one request of the server's 5 per 10 s, so they are spaced. */
async function deny(bits: bigint, allow = 0n): Promise<void> {
  await p.owner.call('PUT', `/servers/${p.server}/permissions/${role}`, { permissions: { allow: Number(allow), deny: Number(bits) } });
  await sleep(2_500);
}
const composer = (page: Page) => page.locator('.composer').last();
const attach = (page: Page) => composer(page).locator('.side').first().getByRole('button');
const visible = (page: Page, text: string, ms = 8_000) => passes(page.getByText(text, { exact: false }).first().waitFor({ timeout: ms }));
/** The dock, the voice panel and the call view all have these buttons. */
const label = (page: Page, name: RegExp) => page.getByRole('button', { name });
/** Bytes of video this page sends per second, over two seconds. */
async function videoSent(page: Page): Promise<number> {
  const total = () => page.evaluate(async () => {
    let bytes = 0;
    for (const pc of (window as unknown as { __pcs: RTCPeerConnection[] }).__pcs) {
      if (pc.connectionState === 'closed') continue;
      (await pc.getStats()).forEach((v: { type: string; kind?: string; bytesSent?: number }) => { if (v.type === 'outbound-rtp' && v.kind === 'video') bytes += v.bytesSent ?? 0; });
    }
    return bytes;
  });
  const before = await total();
  await page.waitForTimeout(2_000);
  return Math.round(((await total()) - before) / 2);
}

let dev: Seat | null = null;
try {
  dev = await seat(browser, 'dev');
  await dev.page.context().grantPermissions(['microphone', 'camera']);
  const page = dev.page;
  const openText = () => page.goto(`${APP}/channels/${p.server}/${p.text}`, { waitUntil: 'networkidle' });
  await openText();
  await composer(page).locator('.cm-content').waitFor({ timeout: 15_000 });

  // 1. Read message history.
  await p.owner.call('POST', `/channels/${p.text}/messages`, { content: 'said before' });
  await deny(P.ReadMessageHistory);
  await openText();
  check(await visible(page, 'You can’t read this channel’s history'), 'without Read message history the channel says why');
  check(!(await page.getByText('said before').isVisible()), 'and shows nothing from before');
  await p.owner.call('POST', `/channels/${p.text}/messages`, { content: 'said now' });
  check(await visible(page, 'said now'), 'a message sent now still shows');
  await deny(0n);
  check(await visible(page, 'said before'), 'granted while open, the history loads without a reload');

  // 2. Upload files.
  await deny(P.UploadFiles);
  await openText();
  await composer(page).locator('.cm-content').waitFor({ timeout: 15_000 });
  check(await attach(page).getAttribute('aria-label') === 'You can’t upload files here' && await attach(page).getAttribute('aria-disabled') === 'true',
    'without Upload files the + button says why', await attach(page).getAttribute('aria-label'));

  // 3. Mention everyone: dev has no role allowing it, and the server's default doesn't.
  await deny(0n);
  const editor = composer(page).locator('.cm-content');
  await editor.click();
  await page.keyboard.type('@ever');
  const suggested = () => page.getByRole('listbox', { name: 'Suggestions' }).getByRole('option', { name: /@everyone/ }).count();
  await sleep(500);
  check(await suggested() === 0, 'without Mention everyone, @everyone is not suggested');
  await page.keyboard.press('Escape');
  await page.keyboard.type('yone hello');
  await page.keyboard.press('Enter');
  check(await visible(page, 'You can’t mention @everyone or @online here.'), 'a refused @everyone says why');
  await page.getByRole('button', { name: 'Delete', exact: true }).first().click().catch(() => {});
  await deny(0n, P.MentionEveryone);
  await editor.click();
  await page.keyboard.type('@ever');
  check(await passes(page.getByRole('listbox', { name: 'Suggestions' }).getByRole('option', { name: /@everyone/ }).waitFor({ timeout: 4_000 })), 'with it, @everyone is suggested');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');

  // 4. In a call: Speak, Video, Listen in turn.
  await deny(0n);
  await page.getByRole('link', { name: /^Alpha/ }).click();
  check(await visible(page, 'Voice connected', 20_000), 'dev joins Alpha');
  await label(page, /^Turn on camera$/).first().click();
  await sleep(4_000);
  const cameraOn = await videoSent(page);
  await deny(P.Speak);
  check(await passes(label(page, /^You can’t speak here$/).first().waitFor({ timeout: 6_000 })), 'without Speak the mute button says "You can’t speak here"');
  check(await label(page, /^You can’t speak here$/).first().getAttribute('aria-disabled') === 'true', 'and is locked');
  await deny(P.Speak | P.Video);
  check(await passes(label(page, /^You can’t use video here$/).first().waitFor({ timeout: 6_000 })), 'without Video the camera button says why');
  await sleep(3_000);
  const cameraAfter = await videoSent(page);
  check(cameraOn > 1_000 && cameraAfter < cameraOn / 10, 'without Speak and Video the camera that was on stops', { cameraOn, cameraAfter });
  await deny(P.Listen);
  check(await visible(page, 'You can’t hear this channel'), 'without Listen the call says she can’t hear');
  await page.getByRole('button', { name: 'Disconnect' }).first().click();
  await sleep(1_000);

  // 5. Connect.
  await deny(P.Connect);
  await openText();
  const alpha = page.getByRole('link', { name: /^Alpha/ });
  check(/You can’t join this channel/.test(await alpha.getAttribute('aria-label') ?? ''), 'without Connect the voice channel says it can’t be joined');
  const joinsBefore = dev.joins;
  await alpha.click();
  check(await visible(page, 'Your roles don’t include Connect here.'), 'opening it says why');
  await sleep(1_500);
  check(dev.joins === joinsBefore && !(await page.getByText('Voice connected').isVisible()), 'and no join_call is sent', dev.joins - joinsBefore);

  // 6. A timeout running out gives everything back at once.
  await deny(0n);
  await openText();
  await p.owner.call('POST', `/channels/${p.text}/messages`, { content: 'react to me' });
  const target = page.locator('article.message', { hasText: 'react to me' });
  await target.waitFor({ timeout: 8_000 });
  const ends = Date.now() + 12_000;
  await p.owner.call('PATCH', `/servers/${p.server}/members/${p.plain.id}`, { timeout: new Date(ends).toISOString() });
  check(await visible(page, "You're timed out", 6_000), 'a timeout blocks the composer');
  await target.hover();
  check(!(await target.getByRole('button', { name: 'Add reaction' }).count()), 'and reactions');
  // The blocked composer has a disabled "+" with the same name, so wait for the editor itself.
  await composer(page).locator('.cm-content').waitFor({ timeout: 20_000 });
  const late = Date.now() - ends;
  check(late < 2_000 && await attach(page).getAttribute('aria-disabled') !== 'true', 'when it ends the composer and + come back at once, without a reload', { lateMs: late });
  await target.hover();
  check(await passes(target.getByRole('button', { name: 'Add reaction' }).waitFor({ timeout: 1_000 })), 'and reactions with them');

  // 7. The role editor, as the owner.
  const owner = await seat(browser, 'dev-admin');
  await owner.page.goto(`${APP}/server-settings/${p.server}/roles`, { waitUntil: 'networkidle' });
  await owner.page.locator('li.role', { has: owner.page.locator('.name', { hasText: /^Everyone$/ }) }).locator('button.open').click();
  check(await passes(owner.page.locator('[data-permission="ViewAuditLogs"]').waitFor({ timeout: 6_000 })), 'the role editor lists View audit log');
  check(/only read/.test(await owner.page.locator('[data-permission="TimeoutMembers"] .help').innerText()), 'Time out says the member can only read');
  check(/Read message history/.test(await owner.page.locator('[data-permission="ViewChannel"] .help').innerText()), 'View channels no longer claims to cover history');
  await owner.page.goto(`${APP}/channel-settings/${p.text}/permissions`, { waitUntil: 'networkidle' });
  await owner.page.locator('[data-permission="SendMessage"]').waitFor({ timeout: 8_000 });
  check(await owner.page.locator('[data-permission="Connect"]').count() === 0, 'a text channel’s overrides leave out voice permissions');
  await owner.page.goto(`${APP}/channel-settings/${p.voiceA}/permissions`, { waitUntil: 'networkidle' });
  check(await passes(owner.page.locator('[data-permission="Connect"]').waitFor({ timeout: 8_000 })), 'a voice channel’s list them');

  const generic = dev.problems.console.filter((c) => /pageerror/.test(c));
  check(!generic.length, 'no page errors', generic);
} finally {
  await browser.close();
  await cleanup(p);
}
if (failures.length) {
  console.error(`\n${failures.length} failed`);
  process.exit(1);
}
console.log('\nall passed');
