/**
 * m4.7-plan.md task 6 on the local dev stack, on a throwaway server (probe-moderation.ts's `setup`), owned by `dev-admin`
 * with `tuuli` as the member moderated and `ben` as the one banned. Nothing seeded is touched, and the server is deleted.
 * - Time out tuuli from her menu, with a reason: her composer is locked, a clock shows by her name, she can't send over
 *   the API, and the reason reaches the audit log. Remove timeout gives it back.
 * - Slow mode 5 s in the channel's settings: tuuli's second message waits with the countdown shown and Stoat refuses it
 *   over the API, while dev-admin, who bypasses it, sends two in a row.
 * - Ban ben with 1 hour of deletion: his recent messages go for others. Then he is unbanned.
 * - Change tuuli's nickname from her menu, then put it back.
 * - Timed out while in a call, tuuli's client leaves it, since Stoat lets a timed-out member keep talking.
 * Usage: node tools/live/src/text-moderation.ts
 */
import type { Browser, Page } from 'playwright-core';
import { chromium } from 'playwright-core';
import { assertDevStack } from '../../seed/src/vps.ts';
import { ApiError } from '../../seed/src/http.ts';
import { BACKEND } from '../../seed/src/config.ts';
import { APP } from './browser.ts';
import { signIn } from './login.ts';
import { person, until } from './people.ts';
import { cleanup, setup } from './probe-moderation.ts';
import { join, seat, voiceBrowser } from './calls.ts';

await assertDevStack();
const failures: string[] = [];
const check = (ok: boolean, what: string, actual?: unknown) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${actual === undefined ? '' : ` -> ${JSON.stringify(actual)}`}`);
  if (!ok) failures.push(what);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const passes = (p: Promise<unknown>) => p.then(() => true, () => false);
/** What Stoat answers to a request, as its status and error type. */
const answer = (p: Promise<unknown>) => p.then(() => 'ok', (e: unknown) => e instanceof ApiError ? `${e.status} ${(e.body as { type?: string } | null)?.type ?? ''}` : String(e));

const p = await setup();
const ben = await person('ben');
const benName = (await ben.call<{ display_name?: string; username: string }>('GET', '/users/@me')).display_name ?? 'ben';
const browser: Browser = await chromium.launch({ headless: true });
const members = (page: Page) => page.locator('aside[aria-label="Members"]');
const row = (page: Page, name: RegExp) => members(page).getByRole('button', { name });
const menu = (page: Page) => page.getByRole('menu').first();
const dialog = (page: Page) => page.getByRole('dialog');
const composer = (page: Page) => page.locator('.composer').last();

async function open(handle: string): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 1450, height: 920 } })).newPage();
  await signIn(page, handle);
  await page.goto(`${APP}/channels/${p.server}/${p.text}`, { waitUntil: 'networkidle' });
  await composer(page).locator('.cm-content').waitFor({ timeout: 15_000 });
  await members(page).waitFor({ timeout: 10_000 });
  return page;
}
async function personMenu(page: Page, name: RegExp) {
  await page.keyboard.press('Escape');
  await row(page, name).click({ button: 'right' });
  await menu(page).waitFor({ timeout: 4_000 });
}
async function say(page: Page, text: string) {
  await composer(page).locator('.cm-content').click();
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}
const auditReasons = async (type: string) => (await p.owner.call<{ audit_logs: { reason?: string | null }[] }>('GET', `/servers/${p.server}/audit_logs?type=${type}&limit=20`)).audit_logs.map((e) => e.reason ?? '');

try {
  const invite = await p.owner.call<{ _id: string }>('POST', `/channels/${p.text}/invites`);
  await ben.call('POST', `/invites/${invite._id}`);
  const owner = await open('dev-admin');
  const tuuli = await open('tuuli');
  const dev = await open('dev');

  // 1. Timeout, from the menu, with a reason.
  await personMenu(owner, /^Open profile of tuuli$/i);
  await menu(owner).getByRole('menuitem', { name: /^Time out/ }).focus();
  await owner.keyboard.press('ArrowRight');
  const lengths = owner.getByRole('menu', { name: 'Time out' });
  await lengths.waitFor({ timeout: 3_000 });
  check(JSON.stringify(await lengths.getByRole('menuitem').allInnerTexts()) === JSON.stringify(['1 minute', '5 minutes', '10 minutes', '1 hour', '1 day', '1 week']), 'Time out offers Discord’s lengths', await lengths.getByRole('menuitem').allInnerTexts());
  await lengths.getByRole('menuitem', { name: '1 hour' }).click();
  await dialog(owner).getByLabel('Reason').fill('live check timeout');
  await dialog(owner).getByRole('button', { name: 'Time out', exact: true }).click();
  check(await passes(tuuli.getByText("You're timed out", { exact: false }).waitFor({ timeout: 8_000 })), 'her composer is locked');
  check(await answer(p.target.call('POST', `/channels/${p.text}/messages`, { content: 'still here' })) === '403 MissingPermission', 'she can’t send over the API');
  check(await passes(row(owner, /^Open profile of tuuli$/i).getByRole('img', { name: /^Timed out until/ }).waitFor({ timeout: 4_000 })), 'a clock shows by her name');
  check((await auditReasons('MemberEdit')).includes('live check timeout'), 'the reason reaches the audit log');
  // Stoat won't time out someone who can time out others, so the item isn't offered for the Moderator.
  await personMenu(owner, /^Open profile of onni$/i);
  check(!(await menu(owner).getByRole('menuitem', { name: /^Time out/ }).count()), 'Time out isn’t offered over someone holding Time out members');
  await personMenu(owner, /^Open profile of tuuli$/i);
  await menu(owner).getByRole('menuitem', { name: /^Time out/ }).focus();
  await owner.keyboard.press('ArrowRight');
  await owner.getByRole('menu', { name: 'Time out' }).getByRole('menuitem', { name: 'Remove timeout' }).click();
  check(await passes(composer(tuuli).locator('.cm-content').waitFor({ timeout: 8_000 })), 'Remove timeout gives her composer back');
  await sleep(2_500);

  // 2. Slow mode, set in the channel's settings.
  await owner.goto(`${APP}/channel-settings/${p.text}/overview`, { waitUntil: 'networkidle' });
  await owner.getByLabel('Slow mode').selectOption({ label: '5 seconds' });
  await owner.getByRole('button', { name: 'Save changes' }).click();
  check(await passes(until(async () => (await p.owner.call<{ slowmode?: number }>('GET', `/channels/${p.text}`)).slowmode === 5, 8_000)), 'slow mode saves as 5 s');
  await owner.goto(`${APP}/channels/${p.server}/${p.text}`, { waitUntil: 'networkidle' });
  await composer(owner).locator('.cm-content').waitFor({ timeout: 15_000 });
  await say(tuuli, 'slow one');
  await tuuli.getByText('slow one').waitFor({ timeout: 6_000 });
  const wait = tuuli.getByRole('img', { name: /^Slow mode: you can send again in \d+ seconds?\./ });
  check(await passes(wait.waitFor({ timeout: 3_000 })), 'her composer counts down the wait', await wait.getAttribute('aria-label').catch(() => null));
  await say(tuuli, 'slow two');
  await sleep(1_000);
  check(!(await dev.getByText('slow two').count()), 'a second message isn’t sent while she waits');
  // Raw, since the seed's helper waits out a 429 and tries again.
  const refused = await fetch(`${BACKEND}/api/channels/${p.text}/messages`, { method: 'POST', headers: { 'x-session-token': p.target.token, 'content-type': 'application/json' }, body: JSON.stringify({ content: 'over the api' }) });
  check(refused.status === 429 && (await refused.json() as { type?: string }).type === 'InSlowmode', 'Stoat refuses it over the API', refused.status);
  await say(owner, 'admin one');
  await say(owner, 'admin two');
  check(await passes(dev.getByText('admin two').waitFor({ timeout: 6_000 })) && await dev.getByText('admin one').count() === 1, 'dev-admin, who bypasses it, sends two in a row');
  check(await passes(composer(tuuli).getByRole('img', { name: /^Slow mode is on/ }).waitFor({ timeout: 8_000 })), 'the countdown ends by itself');
  await p.owner.call('PATCH', `/channels/${p.text}`, { slowmode: 0 });

  // 3. Ban with 1 hour of deletion.
  for (const content of ['ben one', 'ben two']) await ben.call('POST', `/channels/${p.text}/messages`, { content });
  await dev.getByText('ben two').waitFor({ timeout: 6_000 });
  await personMenu(owner, new RegExp(`^Open profile of ${benName}$`, 'i'));
  await menu(owner).getByRole('menuitem', { name: 'Ban', exact: true }).click();
  await dialog(owner).getByLabel('Delete their messages from the last').selectOption({ label: '1 hour' });
  await dialog(owner).getByLabel('Reason').fill('live check ban');
  await dialog(owner).getByRole('button', { name: 'Ban', exact: true }).click();
  check(await passes(until(async () => !(await dev.getByText('ben one').count()) && !(await dev.getByText('ben two').count()), 10_000)), 'his recent messages disappear for others');
  check((await auditReasons('BanCreate')).includes('live check ban'), 'the ban’s reason reaches the audit log');
  await p.owner.call('DELETE', `/servers/${p.server}/bans/${ben.id}`);
  check(!(await p.owner.call<{ bans: unknown[] }>('GET', `/servers/${p.server}/bans`)).bans.length, 'and he is unbanned');

  // 4. Change tuuli's nickname, then put it back.
  await personMenu(owner, /^Open profile of tuuli$/i);
  await menu(owner).getByRole('menuitem', { name: 'Change nickname', exact: true }).click();
  await dialog(owner).getByLabel('Nickname').fill('Tuuli M47');
  await dialog(owner).getByRole('button', { name: 'Save changes' }).click();
  check(await passes(row(dev, /^Open profile of Tuuli M47$/i).waitFor({ timeout: 8_000 })), 'her new nickname shows for others');
  await personMenu(owner, /^Open profile of Tuuli M47$/i);
  await menu(owner).getByRole('menuitem', { name: 'Change nickname', exact: true }).click();
  await dialog(owner).getByLabel('Nickname').fill('');
  await dialog(owner).getByRole('button', { name: 'Save changes' }).click();
  check(await passes(until(async () => !(await p.owner.call<{ nickname?: string | null }>('GET', `/servers/${p.server}/members/${p.target.id}`)).nickname, 15_000)), 'and it is put back');

  // 5. A timeout in a call ends it on Concord.
  const voice = await voiceBrowser();
  try {
    const caller = await seat(voice, 'tuuli');
    await caller.page.goto(`${APP}/channels/${p.server}/${p.text}`, { waitUntil: 'networkidle' });
    await join(caller, 'Alpha');
    // Watched while the request is made: the seed's helper returns only once the server's bucket has room again.
    const toldSoon = passes(caller.page.getByText('You’re timed out, so you left the call.').waitFor({ timeout: 20_000 }));
    await p.owner.call('PATCH', `/servers/${p.server}/members/${p.target.id}`, { timeout: new Date(Date.now() + 60_000).toISOString() });
    const told = await toldSoon;
    const panel = await caller.page.locator('section[aria-label="Voice call"]').innerText().catch(() => '');
    check(told && !panel, 'timed out in a call, her client leaves it', { told, panel, toasts: await caller.page.getByRole('status').allInnerTexts() });
    await p.owner.call('PATCH', `/servers/${p.server}/members/${p.target.id}`, { remove: ['Timeout'] });
  } finally {
    await voice.close();
  }
} finally {
  await browser.close();
  await cleanup(p);
}
if (failures.length) {
  console.error(`\n${failures.length} failed`);
  process.exit(1);
}
console.log('\nall passed');
