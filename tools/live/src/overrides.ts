/**
 * m2c-plan.md task 5 on the live deployment: `dev-admin`, `tuuli` and `onni` in browsers on a fresh check
 * server with roles Moderaattori and Kanavat (manage channels only, held by onni).
 * - #säännöt made read-only for Everyone, with Moderaattori allowed to send: tuuli's composer locks live.
 * - A private channel for Admin only, made through Create channel: tuuli never sees it, then sees it when
 *   given Admin and loses it again.
 * - onni, who can't see the private channel, moves a channel past it: it keeps its place and category.
 * - A removed override doesn't come back in the list.
 * `node tools/live/src/overrides.ts [out-dir]`
 */
import { join } from 'node:path';
import type { Page } from 'playwright-core';
import { APP, launch, watch } from './browser.ts';
import { signIn } from './login.ts';
import { person, until } from './people.ts';
import { checkServer, sidebar, sweep } from './servers.ts';
import { Permission as P } from '../../../packages/domain/src/permissions.ts';

const out = process.argv[2] ?? '.';
const results: Record<string, unknown> = {};
const [admin, tuuli, onni] = await Promise.all(['dev-admin', 'tuuli', 'onni'].map(person));
results.sweptBefore = await sweep(admin!, [tuuli!, onni!]);
const s = await checkServer(admin!, `overrides ${Date.now() % 100000}`, true);
const mod = (await admin!.call<{ id: string }>('POST', `/servers/${s.id}/roles`, { name: 'Moderaattori' })).id;
const kanavat = (await admin!.call<{ id: string }>('POST', `/servers/${s.id}/roles`, { name: 'Kanavat' })).id;
await admin!.call('PUT', `/servers/${s.id}/permissions/${kanavat}`, { permissions: { allow: Number(P.ManageChannel), deny: 0 } });
const saannot = (await admin!.call<{ _id: string }>('POST', `/servers/${s.id}/channels`, { type: 'Text', name: 'säännöt' }))._id;
await admin!.call('PATCH', `/servers/${s.id}`, { categories: [{ id: 'yleinen', title: 'Yleinen', channels: [s.general, saannot] }] });
for (const p of [tuuli!, onni!]) await p.call('POST', `/invites/${s.invite}`);
await admin!.call('PATCH', `/servers/${s.id}/members/${onni!.id}`, { roles: [kanavat] });
// Let dev-admin's server bucket refill before the browser's saves.
await new Promise((r) => setTimeout(r, 10_000));

const browser = await launch();
async function open(handle: string, channel: string) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await context.newPage();
  const problems = watch(page);
  await signIn(page, handle);
  await page.goto(`${APP}/channels/${s.id}/${channel}`, { waitUntil: 'networkidle' });
  await page.getByText('Connected').waitFor({ timeout: 15_000 }).catch(() => {});
  return { page, problems };
}
const a = await open('dev-admin', s.general);
const t = await open('tuuli', saannot);
const o = await open('onni', s.general);
const perm = (page: Page, key: string, state: 'Allow' | 'Deny' | 'Inherit') => page.locator(`[data-permission="${key}"] button[aria-label="${state}"]`);
/** Save, returning when the request left. */
async function save(page: Page): Promise<number> {
  const sent = page.waitForRequest((r) => r.method() === 'PUT' && r.url().includes('/permissions/'), { timeout: 60_000 }).then(() => performance.now());
  await page.getByRole('button', { name: 'Save changes' }).click();
  const at = await sent;
  await page.getByText('You have unsaved changes.').waitFor({ state: 'hidden', timeout: 30_000 });
  return at;
}
const timedFrom = async (at: number, check: () => Promise<boolean>) => { await until(check, 15_000); return Math.round(performance.now() - at); };

// 1. #säännöt read-only for Everyone, Moderaattori allowed to send.
await a.page.goto(`${APP}/channel-settings/${saannot}/permissions`, { waitUntil: 'networkidle' });
await perm(a.page, 'SendMessage', 'Deny').click();
results.summary = await a.page.locator('.summary').textContent();
const locked = await save(a.page);
results.composerLockedMs = await timedFrom(locked, () => t.page.getByText('You don’t have permission to send messages in this channel.').or(t.page.getByText("You don't have permission to send messages in this channel.")).isVisible());
await a.page.getByLabel('Add a role').selectOption({ label: 'Moderaattori' });
await a.page.getByRole('button', { name: 'Add', exact: true }).click();
await perm(a.page, 'SendMessage', 'Allow').click();
await save(a.page);
await a.page.screenshot({ path: join(out, 'overrides-admin.png') });
const ch = await admin!.call<{ default_permissions?: { a: number; d: number }; role_permissions?: Record<string, { a: number; d: number }> }>('GET', `/channels/${saannot}`);
results.saved = { everyoneDeniesSend: (BigInt(ch.default_permissions?.d ?? 0) & P.SendMessage) !== 0n, modAllowsSend: (BigInt(ch.role_permissions?.[mod]?.a ?? 0) & P.SendMessage) !== 0n };

// 2. A private channel for Admin only, through Create channel, placed between General and säännöt.
await a.page.goto(`${APP}/channels/${s.id}/${s.general}`, { waitUntil: 'networkidle' });
await a.page.getByRole('button', { name: 'Create channel in Yleinen' }).click();
const dialog = a.page.locator('dialog[open]');
await dialog.getByLabel('Channel name').fill('salainen');
await dialog.getByText('Private channel').click();
await dialog.locator('label.role', { hasText: 'Admin' }).getByRole('checkbox').check();
await dialog.getByRole('button', { name: 'Create channel' }).click();
const shown = async (page: Page) => (await sidebar(page))[0] ?? '';
await until(async () => (await shown(a.page)).includes('salainen'), 30_000);
await a.page.locator('nav[aria-label="Channels"] a.channel', { hasText: 'salainen' }).click({ button: 'right' });
await a.page.getByRole('menuitem', { name: 'Move up' }).click();
await until(async () => (await shown(a.page)) === 'Yleinen: General, salainen, säännöt', 30_000);
await new Promise((r) => setTimeout(r, 3_000));
results.tuuliSeesPrivate = (await shown(t.page)).includes('salainen');
const salainen = (await admin!.call<{ categories: { channels: string[] }[] }>('GET', `/servers/${s.id}`)).categories[0]!.channels[1]!;
const startRole = performance.now();
await admin!.call('PATCH', `/servers/${s.id}/members/${tuuli!.id}`, { roles: [s.admin] });
results.appearsWithRoleMs = await timedFrom(startRole, async () => (await shown(t.page)).includes('salainen'));
const dropRole = performance.now();
await admin!.call('PATCH', `/servers/${s.id}/members/${tuuli!.id}`, { remove: ['Roles'] });
results.goesWithoutRoleMs = await timedFrom(dropRole, async () => !(await shown(t.page)).includes('salainen'));

// 3. onni can't see it, and moves säännöt up past it.
results.onniSidebar = await shown(o.page);
await o.page.locator('nav[aria-label="Channels"] a.channel', { hasText: 'säännöt' }).click({ button: 'right' });
await o.page.getByRole('menuitem', { name: 'Move up' }).click();
await until(async () => (await shown(o.page)) === 'Yleinen: säännöt, General', 15_000);
await new Promise((r) => setTimeout(r, 3_000));
const cats = (await admin!.call<{ categories: { title: string; channels: string[] }[] }>('GET', `/servers/${s.id}`)).categories;
const names: Record<string, string> = { [s.general]: 'General', [saannot]: 'säännöt', [salainen]: 'salainen' };
results.afterOnniMove = cats.map((c) => `${c.title}: ${c.channels.map((id) => names[id] ?? id).join(', ')}`);

// 4. Remove Moderaattori's override: gone from the list, also after a reload.
await a.page.goto(`${APP}/channel-settings/${saannot}/permissions`, { waitUntil: 'networkidle' });
await a.page.locator('button.entry', { hasText: 'Moderaattori' }).click();
await a.page.getByRole('button', { name: 'Remove override' }).click();
await a.page.getByText('Override removed.').waitFor();
await a.page.reload({ waitUntil: 'networkidle' });
await a.page.locator('button.entry', { hasText: 'Everyone' }).waitFor();
results.removedStaysGone = !(await a.page.locator('button.entry', { hasText: 'Moderaattori' }).isVisible());
await t.page.screenshot({ path: join(out, 'overrides-tuuli.png') });

results.sweptAfter = await sweep(admin!, [tuuli!, onni!]);
console.log(JSON.stringify({ ...results, problems: { admin: a.problems, tuuli: t.problems, onni: o.problems } }, null, 2));
await browser.close();
