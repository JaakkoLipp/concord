/**
 * m2c-plan.md task 4 on the live deployment: `dev-admin` and `onni` in browsers, `tuuli` online over a socket,
 * on a fresh check server.
 * - dev-admin creates the seeded roles other than Admin with their colours, hoisting and permissions, and
 *   reorders them with quick Move clicks.
 * - tuuli, given Pelaajat, shows in that group in onni's member list.
 * - onni, given a test role ranked below Botit with role management but not MentionEveryone, sees the roles
 *   above his locked and MentionEveryone disabled. He can change the roles of tuuli while she ranks below
 *   him, and his menu stops offering it once she outranks him.
 * - Everyone given InviteOthers shows the warning.
 * `node tools/live/src/roles.ts [out-dir]`
 */
import { join } from 'node:path';
import type { Page } from 'playwright-core';
import { APP, launch, watch } from './browser.ts';
import { signIn } from './login.ts';
import { online, person, until } from './people.ts';
import { checkServer, sweep } from './servers.ts';
import { ROLES } from '../../seed/src/data.ts';
import { Permission as P } from '../../../packages/domain/src/permissions.ts';

const out = process.argv[2] ?? '.';
const results: Record<string, unknown> = {};
const [admin, tuuli, onni] = await Promise.all(['dev-admin', 'tuuli', 'onni'].map(person));
results.sweptBefore = await sweep(admin!, [tuuli!, onni!]);
const s = await checkServer(admin!, `roles ${Date.now() % 100000}`, true);
for (const p of [tuuli!, onni!]) await p.call('POST', `/invites/${s.invite}`);
const tuuliOnline = await online(tuuli!);

const browser = await launch();
async function open(handle: string) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await context.newPage();
  const problems = watch(page);
  await signIn(page, handle);
  await page.goto(`${APP}/channels/${s.id}/${s.general}`, { waitUntil: 'networkidle' });
  await page.getByText('Connected').waitFor({ timeout: 15_000 }).catch(() => {});
  return { page, problems };
}
const a = await open('dev-admin');
const o = await open('onni');
const settings = (page: Page) => page.goto(`${APP}/server-settings/${s.id}/roles`, { waitUntil: 'networkidle' });
const saveBarGone = (page: Page) => page.getByText('You have unsaved changes.').waitFor({ state: 'hidden', timeout: 60_000 });
const row = (page: Page, name: string) => page.locator('li.role', { has: page.locator('.name', { hasText: new RegExp(`^${name}$`) }) });
const perm = (page: Page, key: string, state: 'Allow' | 'Deny' | 'Inherit') => page.locator(`[data-permission="${key}"] button[aria-label="${state}"]`);
type WRole = { name: string; colour?: string; hoist?: boolean; rank: number; permissions: { a: number; d: number } };
const roles = async () => Object.values((await admin!.call<{ roles: Record<string, WRole> }>('GET', `/servers/${s.id}`)).roles).sort((x, y) => x.rank - y.rank);

const MOD = ['KickMembers', 'BanMembers', 'TimeoutMembers', 'ManageNicknames', 'RemoveAvatars', 'ManageMessages', 'MuteMembers', 'DeafenMembers', 'MoveMembers', 'MentionEveryone', 'MentionRoles'] as const;
const TEST = ['ManageRole', 'ManagePermissions', 'AssignRoles'] as const;
/** The client's DANGEROUS (apps/web/src/lib/admin/permissions.ts). */
const DANGEROUS: readonly string[] = ['ManageChannel', 'ManageMessages', 'BanMembers', 'ManageServer', 'ManageRole', 'ManagePermissions'];

async function createRole(name: string, colour: string | undefined, hoist: boolean, perms: readonly string[]) {
  await a.page.getByRole('button', { name: 'Create role' }).click();
  await a.page.locator('dialog[open]').getByLabel('Role name').fill(name);
  await a.page.locator('dialog[open]').getByRole('button', { name: 'Create role' }).click();
  await a.page.getByRole('button', { name: 'Back to roles' }).waitFor();
  // The editor opens under the dialog's closing animation, which keeps the page inert: a fill then goes nowhere.
  await a.page.locator('dialog[open]').waitFor({ state: 'detached' });
  if (colour) await a.page.getByRole('textbox', { name: 'Colour' }).fill(colour);
  if (hoist) await a.page.getByLabel('Show members separately').check();
  if (perms.length) {
    await a.page.getByRole('tab', { name: 'Permissions' }).click();
    for (const k of perms) {
      await perm(a.page, k, 'Allow').click();
      // Granting a dangerous one asks first (m4.7-results.md task 11).
      if (DANGEROUS.includes(k)) await a.page.locator('dialog[open]').getByRole('button', { name: 'Give it' }).click();
    }
  }
  if (colour || hoist || perms.length) {
    await a.page.getByRole('button', { name: 'Save changes' }).click();
    await saveBarGone(a.page);
  }
  await a.page.getByRole('button', { name: 'Back to roles' }).click();
  await row(a.page, name).waitFor();
}
async function rowMenu(name: string, item: string) {
  await row(a.page, name).getByRole('button', { name: `${name} options` }).click();
  await a.page.getByRole('menuitem', { name: item }).click();
}

// 1. The seeded roles, other than Admin, which the bootstrap made.
await settings(a.page);
const start = performance.now();
for (const r of ROLES.filter((x) => x.name !== 'Admin')) await createRole(r.name, r.colour, r.hoist, r.name === 'Moderaattori' ? MOD : []);
results.createMs = Math.round(performance.now() - start);

// 2. Quick reorders end in the last order.
for (const item of ['Move up', 'Move up', 'Move down', 'Move down']) await rowMenu('Vakio', item);
await new Promise((r) => setTimeout(r, 4_000));
const listed = async () => (await a.page.locator('li.role .name').allTextContents());
const seededOrder = ['Admin', ...ROLES.filter((x) => x.name !== 'Admin').map((x) => x.name), 'Everyone'];
await until(async () => JSON.stringify(await listed()) === JSON.stringify(seededOrder), 30_000);
// The UI shows each order at once; the writes wait for the bucket behind the role creations. Poll gently.
let made = await roles();
for (let i = 0; i < 12 && made.map((r) => r.name).join() !== seededOrder.slice(0, -1).join(); i++) {
  await new Promise((r) => setTimeout(r, 2_500));
  made = await roles();
}
results.roles = made.map((r) => `${r.name} ${r.colour ?? '-'} ${r.hoist ? 'hoist' : ''}`.trim());
const want = ROLES.filter((x) => x.name !== 'Admin');
results.matchesSeed = want.every((w, i) => made[i + 1]?.name === w.name && made[i + 1]?.colour === w.colour && !!made[i + 1]?.hoist === w.hoist);
const modBits = MOD.reduce((x, k) => x | P[k], 0n);
results.moderatorPermissions = BigInt(made.find((r) => r.name === 'Moderaattori')!.permissions.a) === modBits;

// 3. A test role for onni, moved up below Botit.
await createRole('Testimod', undefined, false, TEST);
for (let i = 0; i < 3; i++) await rowMenu('Testimod', 'Move up');
await until(async () => (await listed()).indexOf('Testimod') === 3, 30_000);
results.testimodUi = await listed();
for (let i = 0; i < 12 && (await roles()).map((r) => r.name).indexOf('Testimod') !== 3; i++) await new Promise((r) => setTimeout(r, 2_500));
results.testimodApi = (await roles()).map((r) => r.name);

// 4. Roles through the member menu: tuuli gets Pelaajat, and shows in that group for onni.
await a.page.goto(`${APP}/channels/${s.id}/${s.general}`, { waitUntil: 'networkidle' });
/**
 * Change a member's roles through the menu's Roles submenu, where each tick saves at once (m4.7-results.md task 4).
 * Returns when the last request left, for timing what follows.
 */
async function setRoles(page: Page, user: string, names: { on: string[]; off?: string[] }): Promise<number> {
  await page.locator('aside[aria-label="Members"] button', { hasText: user }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Roles', exact: true }).click();
  let at = performance.now();
  const ticks = [...names.on.map((n) => [n, true] as const), ...(names.off ?? []).map((n) => [n, false] as const)];
  for (const [n, on] of ticks) {
    const item = page.getByRole('menuitemcheckbox', { name: n, exact: true });
    if ((await item.getAttribute('aria-checked')) === String(on)) continue;
    const sent = page.waitForRequest((r) => r.method() === 'PATCH' && r.url().includes('/members/'), { timeout: 60_000 }).then(() => performance.now());
    await item.click();
    at = await sent;
  }
  for (let i = 0; i < 3 && await page.getByRole('menu').count(); i++) await page.keyboard.press('Escape');
  await page.getByRole('menu').first().waitFor({ state: 'detached', timeout: 5_000 });
  return at;
}
const group = (page: Page, title: string) => page.locator('aside[aria-label="Members"] h3', { hasText: title });
const startGroup = await setRoles(a.page, 'tuuli', { on: ['Pelaajat'] });
await until(async () => (await group(o.page, 'Pelaajat').isVisible()) && (await o.page.locator('aside[aria-label="Members"] ul').nth(0).getByText('tuuli').isVisible()), 15_000);
results.hoistedGroupMs = Math.round(performance.now() - startGroup);
await setRoles(a.page, 'onni', { on: ['Testimod'] });
await a.page.screenshot({ path: join(out, 'roles-members.png') });

// 5. onni's view: locked roles, MentionEveryone disabled, and tuuli's higher role kept.
await settings(o.page);
await row(o.page, 'Vakio').waitFor();
results.onniLocked = await o.page.locator('li.role:has(.locked) .name').allTextContents();
await row(o.page, 'Vakio').locator('button.open').click();
await o.page.getByRole('tab', { name: 'Permissions' }).click();
results.onniMentionEveryoneDisabled = await perm(o.page, 'MentionEveryone', 'Allow').isDisabled();
results.onniManageRoleEnabled = await perm(o.page, 'ManageRole', 'Allow').isEnabled();
await o.page.screenshot({ path: join(out, 'roles-onni.png') });
await o.page.goto(`${APP}/channels/${s.id}/${s.general}`, { waitUntil: 'networkidle' });
// onni changes the roles of tuuli, who ranks below him.
await setRoles(o.page, 'tuuli', { on: ['Vakio'], off: ['Pelaajat'] });
const ids = Object.fromEntries(Object.entries((await admin!.call<{ roles: Record<string, WRole> }>('GET', `/servers/${s.id}`)).roles).map(([id, r]) => [id, r.name]));
const tuuliRoles = async () => ((await admin!.call<{ roles?: string[] }>('GET', `/servers/${s.id}/members/${tuuli!.id}`)).roles ?? []).map((id) => ids[id]).sort();
results.tuuliRolesAfterOnni = await tuuliRoles();
// Once she outranks him, he can't change her roles, and his menu doesn't offer it.
await setRoles(a.page, 'tuuli', { on: ['Moderaattori'] });
await until(async () => (await tuuliRoles()).includes('Moderaattori'), 15_000);
await o.page.waitForTimeout(500);
await o.page.locator('aside[aria-label="Members"] button', { hasText: 'tuuli' }).click({ button: 'right' });
results.onniMenuOnHigherTuuli = await o.page.getByRole('menuitem').allTextContents();
await o.page.keyboard.press('Escape');

// 6. Everyone given InviteOthers: the warning, then Reset.
await settings(a.page);
await a.page.locator('li.role.everyone button.open').click();
await a.page.locator('[data-permission="InviteOthers"] input').check();
results.inviteWarning = await a.page.getByText('This lets people who aren’t admins create invites').isVisible();
await a.page.screenshot({ path: join(out, 'roles-everyone.png') });
await a.page.getByRole('button', { name: 'Reset' }).click();

tuuliOnline.close();
results.sweptAfter = await sweep(admin!, [tuuli!, onni!]);
console.log(JSON.stringify({ ...results, problems: { admin: a.problems, onni: o.problems } }, null, 2));
await browser.close();
