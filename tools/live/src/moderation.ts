/**
 * m2c-plan.md task 6 on the live deployment: `dev-admin`, `tuuli` and `dev` in browsers, on a fresh check
 * server and the seeded one.
 * - dev-admin makes an invite through Invite people; tuuli joins with it over the API.
 * - From the Members section: a kick, then a ban with a reason, each reaching tuuli with its notice. The
 *   Bans section lists her with the reason, a rejoin is refused, and Unban lets her back.
 * - The Invites section revokes the invite, and it stops working.
 * - dev, a plain member of the seeded server, sees no invite or moderation controls.
 * `node tools/live/src/moderation.ts [out-dir]`
 */
import { join } from 'node:path';
import type { Page } from 'playwright-core';
import { APP, launch, watch } from './browser.ts';
import { signIn } from './login.ts';
import { person, until } from './people.ts';
import { checkServer, sweep } from './servers.ts';
import { loadState } from '../../seed/src/config.ts';

const out = process.argv[2] ?? '.';
const results: Record<string, unknown> = {};
const [admin, tuuli] = await Promise.all(['dev-admin', 'tuuli'].map(person));
results.sweptBefore = await sweep(admin!, [tuuli!]);
const s = await checkServer(admin!, `moderation ${Date.now() % 100000}`, true);
await new Promise((r) => setTimeout(r, 10_000));

const browser = await launch();
async function open(handle: string, path: string) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  const problems = watch(page);
  await signIn(page, handle);
  await page.goto(`${APP}${path}`, { waitUntil: 'networkidle' });
  await page.getByText('Connected').waitFor({ timeout: 15_000 }).catch(() => {});
  return { page, problems };
}
const a = await open('dev-admin', `/channels/${s.id}/${s.general}`);
const t = await open('tuuli', '/channels/@me');
const rail = (page: Page, name: string) => page.locator('nav[aria-label="Servers"]').getByRole('link', { name, exact: true });
const dialog = (page: Page) => page.locator('dialog[open]');
const sentAt = (page: Page, method: string, part: string) => page.waitForRequest((r) => r.method() === method && r.url().includes(part), { timeout: 60_000 }).then(() => performance.now());
const timedFrom = async (at: Promise<number>, check: () => Promise<boolean>) => { const t0 = await at; await until(check, 15_000); return Math.round(performance.now() - t0); };

// 1. Invite people, from the server menu.
await a.page.getByRole('button', { name: /menu$/ }).click();
await a.page.getByRole('menuitem', { name: 'Invite people' }).click();
await dialog(a.page).getByRole('button', { name: 'Create invite link' }).click();
const link = await dialog(a.page).getByLabel('Invite link').inputValue();
const code = link.split('/').pop()!;
results.inviteLink = link.replace(code, '<code>');
await dialog(a.page).getByRole('button', { name: 'Done' }).click();
const rejoin = async () => { await tuuli!.call('POST', `/invites/${code}`); await until(() => rail(t.page, s.name).isVisible(), 15_000); };
await rejoin();
results.joinedWithInvite = true;

// 2. Kick and ban from the Members section.
await a.page.goto(`${APP}/server-settings/${s.id}/members`, { waitUntil: 'networkidle' });
const memberMenu = async (item: string) => {
  await a.page.locator('li.member', { hasText: 'tuuli' }).getByRole('button', { name: /options$/ }).click();
  await a.page.getByRole('menuitem', { name: item }).click();
};
await a.page.locator('li.member', { hasText: 'tuuli' }).waitFor({ timeout: 15_000 });
await memberMenu('Kick');
results.kickMs = await timedFrom(Promise.all([sentAt(a.page, 'DELETE', '/members/'), dialog(a.page).getByRole('button', { name: 'Kick' }).click()]).then(([x]) => x),
  () => t.page.getByText(`You were removed from ${s.name}.`).isVisible());
results.kickedGoneFromList = await a.page.locator('li.member', { hasText: 'tuuli' }).isHidden();
await rejoin();
await a.page.locator('li.member', { hasText: 'tuuli' }).waitFor({ timeout: 15_000 });
await memberMenu('Ban');
await dialog(a.page).getByLabel('Reason').fill('Testikielto');
results.banMs = await timedFrom(Promise.all([sentAt(a.page, 'PUT', '/bans/'), dialog(a.page).getByRole('button', { name: 'Ban' }).click()]).then(([x]) => x),
  () => t.page.getByText(`You were banned from ${s.name}.`).isVisible());
await a.page.goto(`${APP}/server-settings/${s.id}/bans`, { waitUntil: 'networkidle' });
const banRow = a.page.locator('li.ban', { hasText: 'tuuli' });
await banRow.waitFor({ timeout: 15_000 });
results.banListed = { reason: await banRow.locator('.reason').textContent() };
results.rejoinWhileBanned = await tuuli!.call('POST', `/invites/${code}`).then(() => 'joined', (e: { body?: { type?: string } }) => e.body?.type ?? String(e));
await a.page.screenshot({ path: join(out, 'moderation-bans.png') });
await banRow.getByRole('button', { name: 'Unban' }).click();
await banRow.waitFor({ state: 'hidden' });
await rejoin();
results.rejoinedAfterUnban = true;

// 3. The Invites section revokes the invite.
await a.page.goto(`${APP}/server-settings/${s.id}/invites`, { waitUntil: 'networkidle' });
const inviteRow = a.page.locator(`tr[data-code="${code}"]`);
await inviteRow.waitFor({ timeout: 15_000 });
results.inviteListed = { creator: await inviteRow.locator('td').nth(2).textContent(), channel: await inviteRow.locator('td').nth(1).textContent() };
await inviteRow.getByRole('button', { name: 'Revoke' }).click();
await dialog(a.page).getByRole('button', { name: 'Revoke' }).click();
await inviteRow.waitFor({ state: 'hidden' });
results.revokedInvite = await tuuli!.call('GET', `/invites/${code}`).then(() => 'still works', (e: { body?: { type?: string } }) => e.body?.type ?? String(e));
await a.page.screenshot({ path: join(out, 'moderation-invites.png') });

// 4. dev in the seeded server: no invite, kick or ban anywhere.
const st = loadState()!;
const d = await open('dev', `/channels/${st.serverId}/${st.channels.yleinen}`);
await d.page.getByRole('button', { name: /menu$/ }).click();
results.devServerMenu = await d.page.getByRole('menuitem').allTextContents();
await d.page.keyboard.press('Escape');
await d.page.locator('nav[aria-label="Channels"] a.channel', { hasText: 'yleinen' }).click({ button: 'right' });
results.devChannelMenu = await d.page.getByRole('menuitem').allTextContents();
await d.page.keyboard.press('Escape');
await d.page.locator('aside[aria-label="Members"] button', { hasText: 'Aino Virtanen' }).click({ button: 'right' });
results.devPersonMenu = await d.page.getByRole('menuitem').allTextContents();
await d.page.keyboard.press('Escape');

results.sweptAfter = await sweep(admin!, [tuuli!]);
console.log(JSON.stringify({ ...results, problems: { admin: a.problems, tuuli: t.problems, dev: d.problems } }, null, 2));
await browser.close();
