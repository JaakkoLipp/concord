/**
 * m2b-plan.md task 4 on the live deployment, with `tuuli` and `onni` in two browsers and `aino` over the API.
 * - tuuli creates a group with onni and aino through the "+" picker, removes aino, adds her back, renames
 *   the group, sets an icon, and hands ownership to onni. onni then leaves as owner. Each step is timed
 *   until the other browser shows it.
 * - Close DM: hidden for tuuli, still there for onni, and back for tuuli when onni writes.
 * Everything is undone at the end. `node tools/live/src/groups.ts [out-dir]`
 */
import { join } from 'node:path';
import type { Page } from 'playwright-core';
import { encodePng } from '../../seed/src/png.ts';
import { APP, launch, watch } from './browser.ts';
import { signIn } from './login.ts';
import { person, unrelate, until } from './people.ts';

const out = process.argv[2] ?? '.';
const results: Record<string, unknown> = {};
const [tuuli, onni, aino] = await Promise.all(['tuuli', 'onni', 'aino'].map(person));
for (const [a, b] of [[tuuli!, onni!], [tuuli!, aino!]] as const) {
  await unrelate(a, b);
  await a.call('POST', '/users/friend', { username: b.tag });
  await b.call('PUT', `/users/${a.id}/friend`);
}

const browser = await launch();
async function open(handle: string) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  const problems = watch(page);
  await signIn(page, handle);
  await page.goto(`${APP}/channels/@me`, { waitUntil: 'networkidle' });
  await page.getByText('Connected').waitFor({ timeout: 15_000 }).catch(() => {});
  return { page, problems };
}
const timed = async (action: () => Promise<unknown>, check: () => Promise<boolean>) => {
  const start = performance.now();
  await action();
  await until(check);
  return Math.round(performance.now() - start);
};
const dmRow = (page: Page, text: string) => page.locator('nav[aria-label="Direct messages"] .row-wrap', { hasText: text });
const panel = (page: Page) => page.locator('aside.group');
const confirmDialog = (page: Page, button: string) => page.getByRole('dialog').getByRole('button', { name: button }).click();

const t = await open('tuuli');
const o = await open('onni');

// Create the group through the picker.
await t.page.getByRole('button', { name: 'Start a DM or group' }).click();
const picker = t.page.getByRole('dialog');
for (const name of ['onni', 'Aino Virtanen']) await picker.locator('label', { hasText: name }).getByRole('checkbox').check();
await picker.getByLabel('Group name').fill('Testiryhmä');
results.createMs = await timed(() => picker.getByRole('button', { name: 'Create group' }).click(), () => dmRow(o.page, 'Testiryhmä').isVisible());
await t.page.waitForURL(/\/channels\/@me\/[0-9A-Z]{26}$/);
const group = t.page.url().split('/').pop()!;
results.group = group;
await o.page.goto(`${APP}/channels/@me/${group}`, { waitUntil: 'networkidle' });
await panel(o.page).waitFor();

// Remove aino, as the owner, then add her back.
await panel(t.page).locator(`li[data-user="${aino!.id}"] button`).click({ button: 'right' });
await t.page.getByRole('menuitem', { name: 'Remove from group' }).click();
results.removeMs = await timed(() => confirmDialog(t.page, 'Remove from group'), async () => !(await panel(o.page).locator(`li[data-user="${aino!.id}"]`).isVisible()));
results.removeLineMs = await until(() => o.page.getByText('tuuli removed Aino Virtanen from the group.').isVisible());
await panel(t.page).getByRole('button', { name: 'Add members' }).click();
await t.page.getByRole('dialog').locator('label', { hasText: 'Aino Virtanen' }).getByRole('checkbox').check();
results.addMs = await timed(() => t.page.getByRole('dialog').getByRole('button', { name: 'Add' }).click(), () => panel(o.page).locator(`li[data-user="${aino!.id}"]`).isVisible());

// Rename and set an icon.
await panel(t.page).getByRole('button', { name: 'Edit group' }).click();
const settings = t.page.getByRole('dialog');
await settings.getByLabel('Group name').fill('Saunaporukka');
await settings.locator('input[type=file]').setInputFiles({ name: 'icon.png', mimeType: 'image/png', buffer: Buffer.from(encodePng(64, 64, (x, y) => [200, x * 4, y * 4, 255])) });
results.renameAndIconMs = await timed(() => settings.getByRole('button', { name: 'Save' }).click(),
  async () => (await dmRow(o.page, 'Saunaporukka').isVisible()) && (await dmRow(o.page, 'Saunaporukka').locator('img.group-icon').isVisible()));
results.renameLineMs = await until(() => o.page.getByText('tuuli renamed the group to Saunaporukka.').isVisible());

// Hand ownership to onni.
await panel(t.page).locator(`li[data-user="${onni!.id}"] button`).click({ button: 'right' });
await t.page.getByRole('menuitem', { name: 'Make group owner' }).click();
results.ownerMs = await timed(() => confirmDialog(t.page, 'Make group owner'), () => panel(o.page).locator(`li[data-user="${onni!.id}"] .crown`).isVisible());
await o.page.screenshot({ path: join(out, 'groups-onni.png') });

// onni leaves as owner: Stoat hands the group to someone, and only a system message says who.
await panel(o.page).getByRole('button', { name: 'Leave group' }).click();
results.leaveMs = await timed(() => confirmDialog(o.page, 'Leave group'), async () => !(await panel(t.page).locator(`li[data-user="${onni!.id}"]`).isVisible()));
await until(() => panel(t.page).locator('.crown').isVisible());
results.newOwnerShown = await panel(t.page).locator('li:has(.crown)').getAttribute('data-user').then((id) => (id === tuuli!.id ? 'tuuli' : id === aino!.id ? 'aino' : id));
await until(async () => !o.page.url().includes(group));
results.onniRedirected = o.page.url().endsWith('/channels/@me');
await t.page.screenshot({ path: join(out, 'groups-tuuli.png') });

// Close DM.
const dm = await tuuli!.call<{ _id: string }>('GET', `/users/${onni!.id}/dm`);
await onni!.call('POST', `/channels/${dm._id}/messages`, { content: 'Moi tuuli' });
await until(() => dmRow(t.page, 'onni').isVisible());
await dmRow(t.page, 'onni').hover();
await dmRow(t.page, 'onni').getByRole('button', { name: 'Close DM' }).click();
results.closedForTuuli = !(await dmRow(t.page, 'onni').isVisible());
await o.page.reload({ waitUntil: 'networkidle' });
results.openForOnni = await dmRow(o.page, 'tuuli').isVisible();
results.reopensOnMessageMs = await timed(() => onni!.call('POST', `/channels/${dm._id}/messages`, { content: 'Oletko siellä?' }), () => dmRow(t.page, 'onni').isVisible());

// Clean up.
for (const p of [tuuli!, aino!]) await p.call('DELETE', `/channels/${group}?leave_silently=true`).catch(() => {});
await unrelate(tuuli!, onni!);
await unrelate(tuuli!, aino!);
console.log(JSON.stringify({ ...results, tuuli: t.problems, onni: o.problems }, null, 2));
await browser.close();
