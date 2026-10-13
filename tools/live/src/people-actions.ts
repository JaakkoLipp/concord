/**
 * m2b-plan.md task 3 on the live deployment: `tuuli` in the server, `onni` on the friends screen.
 * - From onni's popout in the member list, tuuli adds onni as a friend. onni accepts, the popout's button
 *   turns into Message, and Message opens the DM.
 * - The member list's right-click menu lists the actions.
 * - tuuli blocks onni from a message author's menu: onni's messages collapse in #botti and in a group they
 *   share, and Show brings them back.
 * Everything is undone at the end. `node tools/live/src/people-actions.ts [out-dir]`
 */
import { join } from 'node:path';
import { loadState } from '../../seed/src/config.ts';
import { APP, launch, watch } from './browser.ts';
import { signIn } from './login.ts';
import { person, unrelate, until } from './people.ts';

const out = process.argv[2] ?? '.';
const st = loadState()!;
const results: Record<string, unknown> = {};
const [tuuli, onni] = await Promise.all(['tuuli', 'onni'].map(person));
await unrelate(tuuli!, onni!);

const browser = await launch();
async function open(handle: string, path: string) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  const problems = watch(page);
  await signIn(page, handle);
  await page.goto(`${APP}${path}`, { waitUntil: 'networkidle' });
  await page.getByText('Connected').waitFor({ timeout: 15_000 }).catch(() => {});
  return { page, problems };
}
const timed = async (action: () => Promise<unknown>, check: () => Promise<boolean>) => {
  const start = performance.now();
  await action();
  await until(check);
  return Math.round(performance.now() - start);
};

const botti = `/channels/${st.serverId}/${st.channels.botti}`;
const o = await open('onni', '/channels/@me');
const t = await open('tuuli', botti);
await o.page.getByRole('tab', { name: /^Pending/ }).click();

// Add friend from the popout.
const members = t.page.locator('aside[aria-label=Members]');
await members.getByRole('button', { name: /onni/ }).click();
const card = t.page.locator('.card.popout');
await card.waitFor();
results.addFromPopoutMs = await timed(() => card.getByRole('button', { name: 'Add friend' }).click(), () => o.page.locator(`li.row[data-user="${tuuli!.id}"]`).isVisible());
results.popoutAfterRequest = await card.getByRole('button', { name: 'Friend request sent' }).isVisible();
results.acceptToMessageMs = await timed(() => o.page.locator(`li.row[data-user="${tuuli!.id}"]`).getByRole('button', { name: 'Accept' }).click(), () => card.getByRole('button', { name: 'Message' }).isVisible());
await t.page.screenshot({ path: join(out, 'people-popout.png') });
await card.getByRole('button', { name: 'Message' }).click();
await t.page.waitForURL(/\/channels\/@me\/[0-9A-Z]{26}/);
results.messageOpensDm = true;

// The member list's context menu.
await t.page.goto(`${APP}${botti}`, { waitUntil: 'networkidle' });
await members.getByRole('button', { name: /onni/ }).click({ button: 'right' });
results.memberMenu = await t.page.getByRole('menuitem').allInnerTexts();
await t.page.keyboard.press('Escape');

// Messages from onni in #botti and in a group the two share.
const group = await tuuli!.call<{ _id: string }>('POST', '/channels/create', { name: 'Estotesti', users: [onni!.id] });
for (const text of ['Ensimmäinen viesti', 'Toinen viesti']) await onni!.call('POST', `/channels/${st.channels.botti}/messages`, { content: text });
await onni!.call('POST', `/channels/${group._id}/messages`, { content: 'Ryhmäviesti' });
await t.page.getByText('Toinen viesti').waitFor();

// Block from the author's menu.
await t.page.locator('.head .name', { hasText: 'onni' }).last().click({ button: 'right' });
await t.page.getByRole('menuitem', { name: 'Block' }).click();
await t.page.getByRole('dialog').getByRole('button', { name: 'Block' }).click();
await until(() => t.page.locator('.blocked-run').last().isVisible());
results.collapsedInChannel = await t.page.locator('.blocked-run').last().innerText();
results.hiddenInChannel = !(await t.page.getByText('Toinen viesti').isVisible());
await t.page.screenshot({ path: join(out, 'people-blocked.png') });
await t.page.locator('.blocked-run').last().getByRole('button', { name: 'Show' }).click();
results.shownAfterClick = await t.page.getByText('Toinen viesti').isVisible();
await t.page.goto(`${APP}/channels/@me/${group._id}`, { waitUntil: 'networkidle' });
await until(() => t.page.locator('.blocked-run').isVisible());
results.collapsedInGroup = await t.page.locator('.blocked-run').innerText();
results.hiddenInGroup = !(await t.page.getByText('Ryhmäviesti').isVisible());

// Clean up: onni's messages, the group, the relationship.
const mine = await onni!.call<{ _id: string; author: string }[]>('GET', `/channels/${st.channels.botti}/messages?limit=10`);
for (const msg of mine.filter((x) => x.author === onni!.id)) await onni!.call('DELETE', `/channels/${st.channels.botti}/messages/${msg._id}`);
await onni!.call('DELETE', `/channels/${group._id}?leave_silently=true`).catch(() => {});
await tuuli!.call('DELETE', `/channels/${group._id}?leave_silently=true`).catch(() => {});
await unrelate(tuuli!, onni!);
console.log(JSON.stringify({ ...results, tuuli: t.problems, onni: o.problems }, null, 2));
await browser.close();
