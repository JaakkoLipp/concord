/**
 * m2b-plan.md task 2 on the live deployment: `tuuli` and `onni` in two browsers, both on the friends screen.
 * - A request sent through "Add friend", accepted, removed, blocked and unblocked, each timed until the
 *   other browser shows it.
 * - tuuli's DM with onni: the composer follows each state.
 * - tuuli, a new account, has 5 requests waiting: a sixth shows the limit message.
 * Everything is undone at the end. `node tools/live/src/friends.ts [out-dir]`
 */
import { join } from 'node:path';
import type { Page } from 'playwright-core';
import { APP, launch, watch } from './browser.ts';
import { signIn } from './login.ts';
import { person, unrelate, until } from './people.ts';

const out = process.argv[2] ?? '.';
const results: Record<string, unknown> = {};
const others = ['aino', 'ben', 'eetu', 'sanna', 'lauri', 'maija'];
const [tuuli, onni, ...seeded] = await Promise.all(['tuuli', 'onni', ...others].map(person));
await unrelate(tuuli!, onni!);
for (const p of seeded) await unrelate(tuuli!, p);

const browser = await launch();
async function open(handle: string) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  const problems = watch(page);
  await signIn(page, handle);
  await page.goto(`${APP}/channels/@me`, { waitUntil: 'networkidle' });
  await page.getByText('Connected').waitFor({ timeout: 15_000 }).catch(() => {});
  return { page, problems, context };
}
const timed = async (action: () => Promise<unknown>, check: () => Promise<boolean>) => {
  const start = performance.now();
  await action();
  await until(check);
  return Math.round(performance.now() - start);
};
const tab = (page: Page, name: string) => page.getByRole('tab', { name: new RegExp(`^${name}`) }).click();
const row = (page: Page, id: string) => page.locator(`li.row[data-user="${id}"]`);

const t = await open('tuuli');
const o = await open('onni');

// Request through Add friend, until onni's Pending tab lists it.
await tab(o.page, 'Pending');
await t.page.getByRole('button', { name: 'Add friend' }).click();
await t.page.getByLabel('Username and number').fill(onni!.tag);
results.requestMs = await timed(() => t.page.getByRole('button', { name: 'Send friend request' }).click(), () => row(o.page, tuuli!.id).isVisible());
results.sentNotice = await t.page.getByText(`Friend request sent to ${onni!.tag}.`).isVisible();
results.pendingBadge = await o.page.getByRole('tab', { name: /^Pending/ }).innerText();

// Accept, until tuuli's All tab lists onni.
await tab(t.page, 'All');
results.acceptMs = await timed(() => row(o.page, tuuli!.id).getByRole('button', { name: 'Accept' }).click(), () => row(t.page, onni!.id).isVisible());

// tuuli opens the DM through Message: the composer is enabled.
await row(t.page, onni!.id).getByRole('button', { name: 'Message' }).click();
await t.page.waitForURL(/\/channels\/@me\/[0-9A-Z]{26}/);
await t.page.locator('.composer .cm-content').waitFor();
results.composerAsFriends = 'enabled';
await t.page.screenshot({ path: join(out, 'friends-dm.png') });

// onni removes tuuli as a friend, through the menu and the confirmation.
await tab(o.page, 'All');
await row(o.page, tuuli!.id).getByRole('button', { name: 'More' }).click();
await o.page.getByRole('menuitem', { name: 'Remove friend' }).click();
await o.page.getByRole('dialog').waitFor();
results.removeMs = await timed(() => o.page.getByRole('dialog').getByRole('button', { name: 'Remove friend' }).click(), () => t.page.getByText('You can only message friends.').isVisible());

// Friends again over the API, then onni blocks through the menu.
await tuuli!.call('POST', '/users/friend', { username: onni!.tag });
await onni!.call('PUT', `/users/${tuuli!.id}/friend`);
await t.page.locator('.composer .cm-content').waitFor();
await row(o.page, tuuli!.id).getByRole('button', { name: 'More' }).click();
await o.page.getByRole('menuitem', { name: 'Block' }).click();
results.blockMs = await timed(() => o.page.getByRole('dialog').getByRole('button', { name: 'Block' }).click(), () => t.page.getByText("This person isn't accepting messages from you.").isVisible());

// onni unblocks from the Blocked tab.
await tab(o.page, 'Blocked');
results.unblockMs = await timed(() => row(o.page, tuuli!.id).getByRole('button', { name: 'Unblock' }).click(), () => t.page.getByText('You can only message friends.').isVisible());
results.blockedTabEmpty = await o.page.getByText("You haven't blocked anyone.").isVisible();

// The request limit for a new account: five waiting, then a sixth through the UI.
for (const p of seeded.slice(0, 5)) await tuuli!.call('POST', '/users/friend', { username: p.tag });
await t.page.goto(`${APP}/channels/@me`, { waitUntil: 'networkidle' });
await t.page.getByRole('button', { name: 'Add friend' }).click();
await t.page.getByLabel('Username and number').fill(seeded[5]!.tag);
await t.page.getByRole('button', { name: 'Send friend request' }).click();
await t.page.getByRole('alert').waitFor();
results.limitMessage = await t.page.getByRole('alert').innerText();
await t.page.screenshot({ path: join(out, 'friends-limit.png') });
await tab(t.page, 'Pending');
await o.page.screenshot({ path: join(out, 'friends-onni.png') });
await t.page.screenshot({ path: join(out, 'friends-pending.png') });

// A request cancelled while tuuli is offline is gone after the reconnect: Ready ends what it doesn't list.
for (const p of seeded) await unrelate(tuuli!, p);
await unrelate(tuuli!, onni!);
await onni!.call('POST', '/users/friend', { username: tuuli!.tag });
await row(t.page, onni!.id).waitFor();
await t.context.setOffline(true);
await onni!.call('DELETE', `/users/${tuuli!.id}/friend`);
// The socket notices it is gone when a Pong doesn't come: up to 30 s.
await t.page.waitForTimeout(35_000);
results.stillListedWhileOffline = await row(t.page, onni!.id).isVisible();
await t.context.setOffline(false);
results.cancelledWhileOfflineGone = await until(async () => !(await row(t.page, onni!.id).isVisible()), 30_000).then(() => true, () => false);

await unrelate(tuuli!, onni!);
for (const p of seeded) await unrelate(tuuli!, p);
console.log(JSON.stringify({ ...results, tuuli: t.problems, onni: o.problems }, null, 2));
await browser.close();
