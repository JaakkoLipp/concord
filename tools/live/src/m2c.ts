/**
 * M2c's acceptance check (m2c-plan.md task 9) on the live deployment.
 * 1. An admin builds a server like the seeded one from scratch in the UI, as `dev-admin`: created through "+",
 *    with icon, banner, description, categories, channels, read-only channels, roles, emoji, an invite, members'
 *    roles and system messages. Its structure is compared with the seeded server over the API, then it is
 *    deleted through settings.
 * 2. A non-admin, `dev`, can't create a server or an invite, over the API as well as in the UI.
 * The notification criterion is `notify.ts`.
 * `node tools/live/src/m2c.ts [out-dir]`
 */
import { join } from 'node:path';
import type { Page } from 'playwright-core';
import { APP, launch, watch } from './browser.ts';
import { signIn } from './login.ts';
import { person } from './people.ts';
import { PREFIX, sidebar, sweep } from './servers.ts';
import { loadState } from '../../seed/src/config.ts';
import { CATEGORIES, ROLES } from '../../seed/src/data.ts';
import { emojiShape, gradient, identicon } from '../../seed/src/png.ts';
import { Rng } from '../../seed/src/rng.ts';
import { Permission as P } from '../../../packages/domain/src/permissions.ts';

const out = process.argv[2] ?? '.';
const st = loadState()!;
const results: Record<string, unknown> = {};
const [admin, tuuli, onni, dev] = await Promise.all(['dev-admin', 'tuuli', 'onni', 'dev'].map(person));
results.sweptBefore = await sweep(admin!, [tuuli!, onni!]);

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
const a = await open('dev-admin', '/channels/@me');
const pg = a.page;
const dialog = () => pg.locator('dialog[open]');
const saved = () => pg.getByText('You have unsaved changes.').waitFor({ state: 'hidden', timeout: 90_000 });
const channel = (name: string) => pg.locator('nav[aria-label="Channels"] a.channel', { has: pg.locator('.name', { hasText: new RegExp(`^${name}$`) }) });
const menuOn = async (target: ReturnType<Page['locator']>, item: string) => { await target.click({ button: 'right' }); await pg.getByRole('menuitem', { name: item }).click(); };
const png = (b: Uint8Array) => Buffer.from(b);
const start = performance.now();
const step: Record<string, number> = {};
const lap = (name: string, from: number) => { step[name] = Math.round((performance.now() - from) / 1000); };

// 1. Create through "+", with an icon.
let t0 = performance.now();
const name = `${PREFIX} kehitys ${Date.now() % 1000}`;
await pg.getByRole('button', { name: 'Create a server' }).click();
await dialog().getByLabel('Server name').fill(name);
await dialog().locator('input[type=file]').setInputFiles({ name: 'icon.png', mimeType: 'image/png', buffer: png(identicon(new Rng(7), 256)) });
await dialog().getByRole('button', { name: 'Create' }).click();
await pg.waitForURL(/\/channels\/[0-9A-Z]{26}\/[0-9A-Z]{26}$/, { timeout: 30_000 });
const server = pg.url().split('/').at(-2)!;
results.server = server;
lap('create', t0);

// 2. Categories and channels, General becoming #yleinen.
t0 = performance.now();
for (const cat of CATEGORIES) {
  await pg.getByRole('button', { name: /menu$/ }).click();
  await pg.getByRole('menuitem', { name: 'Create category' }).click();
  await dialog().getByLabel('Category name').fill(cat.title);
  await dialog().getByRole('button', { name: 'Create category' }).click();
  await pg.locator('nav[aria-label="Channels"] .category', { hasText: cat.title }).waitFor();
}
await menuOn(channel('General'), 'Move to category…');
await dialog().getByLabel('Category').selectOption({ label: 'Yleinen' });
await dialog().getByRole('button', { name: 'Move' }).click();
await menuOn(channel('General'), 'Edit channel');
await pg.getByLabel('Channel name').fill('yleinen');
await pg.getByRole('button', { name: 'Save changes' }).click();
await saved();
await pg.keyboard.press('Escape');
await pg.locator('nav[aria-label="Channels"]').waitFor();
for (const cat of CATEGORIES) {
  for (const ch of cat.channels) {
    if (ch.key === 'yleinen') continue;
    await pg.getByRole('button', { name: `Create channel in ${cat.title}` }).click();
    if ('voice' in ch) await dialog().getByText('Voice', { exact: true }).click();
    await dialog().getByLabel('Channel name').fill(ch.name);
    await dialog().getByRole('button', { name: 'Create channel' }).click();
    await channel(ch.name).waitFor({ timeout: 60_000 });
    if ('description' in ch) {
      await menuOn(channel(ch.name), 'Edit channel');
      await pg.getByLabel('Description').fill(ch.description);
      await pg.getByRole('button', { name: 'Save changes' }).click();
      await saved();
      await pg.keyboard.press('Escape');
      await pg.locator('nav[aria-label="Channels"]').waitFor();
    }
  }
}
lap('channels', t0);

// 3. Overview: banner, description, system messages to #botti.
t0 = performance.now();
await pg.goto(`${APP}/server-settings/${server}/overview`, { waitUntil: 'networkidle' });
await pg.locator('input[type=file]').nth(1).setInputFiles({ name: 'banner.png', mimeType: 'image/png', buffer: png(gradient(new Rng(8), 960, 540)) });
await pg.getByLabel('Description').fill('Concordin kehityspalvelin. The Concord development server.');
for (const kind of ['Joins', 'Leaves', 'Kicks', 'Bans']) await pg.getByLabel(kind).selectOption({ label: '#botti' });
await pg.getByRole('button', { name: 'Save changes' }).click();
await saved();
lap('overview', t0);

// 4. Roles other than Admin, which the bootstrap made.
t0 = performance.now();
const MOD = ['KickMembers', 'BanMembers', 'TimeoutMembers', 'ManageNicknames', 'RemoveAvatars', 'ManageMessages', 'MuteMembers', 'DeafenMembers', 'MoveMembers', 'MentionEveryone', 'MentionRoles'] as const;
await pg.goto(`${APP}/server-settings/${server}/roles`, { waitUntil: 'networkidle' });
for (const r of ROLES.filter((x) => x.name !== 'Admin')) {
  await pg.getByRole('button', { name: 'Create role' }).click();
  await dialog().getByLabel('Role name').fill(r.name);
  await dialog().getByRole('button', { name: 'Create role' }).click();
  await pg.getByRole('button', { name: 'Back to roles' }).waitFor();
  await pg.getByRole('textbox', { name: 'Colour' }).fill(r.colour);
  if (r.hoist) await pg.getByLabel('Show members separately').check();
  if (r.name === 'Moderaattori') {
    await pg.getByRole('tab', { name: 'Permissions' }).click();
    for (const k of MOD) await pg.locator(`[data-permission="${k}"] button[aria-label="Allow"]`).click();
  }
  await pg.getByRole('button', { name: 'Save changes' }).click();
  await saved();
  await pg.getByRole('button', { name: 'Back to roles' }).click();
}
lap('roles', t0);

// 5. #säännöt and #ilmoitukset read-only, Moderaattori allowed to send.
t0 = performance.now();
const readOnly = (CATEGORIES as readonly { channels: readonly { name: string; readOnly?: boolean }[] }[]).flatMap((c) => c.channels).filter((c) => c.readOnly);
for (const ch of readOnly) {
  await pg.goto(`${APP}/channels/@me`, { waitUntil: 'networkidle' });
  await pg.locator('nav[aria-label="Servers"]').getByRole('link', { name, exact: true }).click();
  await menuOn(channel(ch.name), 'Edit channel');
  await pg.getByRole('link', { name: 'Permissions' }).click();
  await pg.locator('[data-permission="SendMessage"] button[aria-label="Deny"]').click();
  await pg.getByRole('button', { name: 'Save changes' }).click();
  await saved();
  await pg.getByLabel('Add a role').selectOption({ label: 'Moderaattori' });
  await pg.getByRole('button', { name: 'Add', exact: true }).click();
  await pg.locator('[data-permission="SendMessage"] button[aria-label="Allow"]').click();
  await pg.getByRole('button', { name: 'Save changes' }).click();
  await saved();
  await pg.keyboard.press('Escape');
}
lap('overrides', t0);

// 6. Three emoji.
t0 = performance.now();
await pg.goto(`${APP}/server-settings/${server}/emoji`, { waitUntil: 'networkidle' });
for (const [i, e] of ['kahvi', 'sauna', 'pulla'].entries()) {
  await pg.getByLabel('Choose image').setInputFiles({ name: `${e}.png`, mimeType: 'image/png', buffer: png(emojiShape(new Rng(100 + i), i)) });
  await pg.getByRole('button', { name: 'Upload emoji' }).click();
  await pg.locator(`li.emoji[data-emoji="${e}"]`).waitFor({ timeout: 30_000 });
}
lap('emoji', t0);

// 7. An invite through the dialog; tuuli and onni join, and get roles from the member menu.
t0 = performance.now();
await pg.goto(`${APP}/channels/@me`, { waitUntil: 'networkidle' });
await pg.locator('nav[aria-label="Servers"]').getByRole('link', { name, exact: true }).click();
await pg.getByRole('button', { name: /menu$/ }).click();
await pg.getByRole('menuitem', { name: 'Invite people' }).click();
await dialog().getByRole('button', { name: 'Create invite link' }).click();
const code = (await dialog().getByLabel('Invite link').inputValue()).split('/').pop()!;
await dialog().getByRole('button', { name: 'Done' }).click();
for (const p of [tuuli!, onni!]) await p.call('POST', `/invites/${code}`);
await pg.goto(`${APP}/server-settings/${server}/members`, { waitUntil: 'networkidle' });
for (const [who, role] of [['tuuli', 'Pelaajat'], ['onni', 'Moderaattori']] as const) {
  const row = pg.locator('li.member', { hasText: who });
  await row.waitFor({ timeout: 15_000 });
  await row.getByRole('button', { name: /options$/ }).click();
  await pg.getByRole('menuitem', { name: 'Roles…' }).click();
  await dialog().getByLabel(role, { exact: true }).check();
  await dialog().getByRole('button', { name: 'Save changes' }).click();
  await dialog().waitFor({ state: 'hidden', timeout: 60_000 });
}
lap('members', t0);
results.buildSeconds = Math.round((performance.now() - start) / 1000);
results.steps = step;
await pg.goto(`${APP}/channels/@me`, { waitUntil: 'networkidle' });
await pg.locator('nav[aria-label="Servers"]').getByRole('link', { name, exact: true }).click();
await pg.locator('nav[aria-label="Channels"]').waitFor();
results.sidebar = await sidebar(pg);
await pg.screenshot({ path: join(out, 'm2c-built.png') });

// Compare with the seeded server, over the API. Writes may still be waiting for the bucket: poll gently.
type WRole = { name: string; colour?: string; hoist?: boolean; rank: number; permissions: { a: number; d: number } };
type WServer = { name: string; description?: string; icon?: object; banner?: object; default_permissions: number; channels: string[]; categories?: { title: string; channels: string[] }[]; roles?: Record<string, WRole>; system_messages?: Record<string, string> };
type WChannel = { _id: string; name: string; description?: string; voice?: object; default_permissions?: { a: number; d: number }; role_permissions?: Record<string, { a: number; d: number }> };
async function structure(id: string) {
  const s = await admin!.call<WServer>('GET', `/servers/${id}`);
  const roles = s.roles ?? {};
  const byId = new Map<string, WChannel>();
  for (const c of s.channels) byId.set(c, await admin!.call<WChannel>('GET', `/channels/${c}`).catch(() => ({ _id: c, name: '?' })));
  const override = (o?: { a: number; d: number }) => (o && (o.a || o.d) ? `+${o.a}-${o.d}` : undefined);
  const ch = (c: string) => {
    const x = byId.get(c);
    if (!x) return null;
    const ov = Object.entries(x.role_permissions ?? {}).filter(([, o]) => override(o)).map(([r, o]) => `${roles[r]?.name}${override(o)}`).sort();
    return [x.name, x.voice ? 'voice' : 'text', x.description ?? '', override(x.default_permissions) ?? '', ov.join(' ')].join(' | ');
  };
  const ranked = Object.values(roles).sort((x, y) => x.rank - y.rank);
  const nameOf = (c?: string) => (c ? byId.get(c)?.name : undefined);
  return {
    hasIcon: !!s.icon, hasBanner: !!s.banner, description: s.description ?? '',
    categories: (s.categories ?? []).map((c) => `${c.title}: ${c.channels.filter((x) => byId.has(x)).map(ch).join(' / ')}`),
    roles: ranked.filter((r) => r.name !== 'Admin').map((r) => `${r.name} ${r.colour ?? '-'} ${r.hoist ? 'hoist' : 'flat'} +${r.permissions.a}-${r.permissions.d}`),
    adminFirst: ranked[0]?.name === 'Admin' && (BigInt(ranked[0].permissions.a) & P.InviteOthers) !== 0n,
    everyone: s.default_permissions,
    system: [nameOf(s.system_messages?.user_joined), nameOf(s.system_messages?.user_left), nameOf(s.system_messages?.user_kicked), nameOf(s.system_messages?.user_banned)],
  };
}
const seeded = await structure(st.serverId);
let built = await structure(server);
for (let i = 0; i < 8 && JSON.stringify({ ...built }) !== JSON.stringify({ ...seeded }); i++) {
  await new Promise((r) => setTimeout(r, 2_500));
  built = await structure(server);
}
const diff: Record<string, unknown> = {};
for (const k of Object.keys(seeded) as (keyof typeof seeded)[]) if (JSON.stringify(seeded[k]) !== JSON.stringify(built[k])) diff[k] = { seeded: seeded[k], built: built[k] };
results.matchesSeeded = !Object.keys(diff).length;
results.differences = diff;
const emoji = await admin!.call<{ name: string; parent: { id: string } }[]>('GET', `/servers/${server}/emojis`).catch(() => []);
results.emoji = emoji.map((e) => e.name).sort();
const roleIds = Object.fromEntries(Object.entries((await admin!.call<WServer>('GET', `/servers/${server}`)).roles ?? {}).map(([id, r]) => [id, r.name]));
results.memberRoles = {
  tuuli: ((await admin!.call<{ roles?: string[] }>('GET', `/servers/${server}/members/${tuuli!.id}`)).roles ?? []).map((r) => roleIds[r]),
  onni: ((await admin!.call<{ roles?: string[] }>('GET', `/servers/${server}/members/${onni!.id}`)).roles ?? []).map((r) => roleIds[r]),
};

// Delete through settings.
await pg.goto(`${APP}/server-settings/${server}/overview`, { waitUntil: 'networkidle' });
await pg.getByRole('button', { name: 'Delete server' }).click();
await dialog().getByLabel('Type the server’s name to confirm').fill(name);
await dialog().getByRole('button', { name: 'Delete server' }).click();
await pg.waitForURL(/\/channels\/@me$/, { timeout: 30_000 });
results.deleted = true;

// 8. A non-admin can't create a server or an invite, and sees no controls for either.
const nonAdmin = {
  createServer: await dev!.call('POST', '/servers/create', { name: `${PREFIX} not allowed` }).then(() => 'created!', (e: { body?: { type?: string } }) => e.body?.type),
  createInvite: await dev!.call('POST', `/channels/${st.channels.yleinen}/invites`).then(() => 'created!', (e: { body?: { type?: string } }) => e.body?.type),
} as Record<string, unknown>;
const d = await open('dev', `/channels/${st.serverId}/${st.channels.yleinen}`);
nonAdmin.plusButton = await d.page.getByRole('button', { name: 'Create a server' }).count();
await d.page.getByRole('button', { name: /menu$/ }).click();
nonAdmin.serverMenu = await d.page.getByRole('menuitem').allTextContents();
await d.page.keyboard.press('Escape');
await d.page.locator('nav[aria-label="Channels"] a.channel', { hasText: 'yleinen' }).click({ button: 'right' });
nonAdmin.channelMenu = await d.page.getByRole('menuitem').allTextContents();
await d.page.keyboard.press('Escape');
results.nonAdmin = nonAdmin;

results.sweptAfter = await sweep(admin!, [tuuli!, onni!]);
console.log(JSON.stringify({ ...results, problems: { admin: a.problems, dev: d.problems } }, null, 2));
await browser.close();
