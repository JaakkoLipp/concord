/**
 * M4.8 task 10b on the local stack: `node tools/live/src/folders.ts`. A throwaway account in the seeded server and
 * three check servers signs in in two browser contexts. In the first it drags one server onto another, which makes
 * a folder; the second context shows it live and after a reload. It renames the folder from its menu, opens it, and
 * drags a third server onto it. Leaving that server drops it from the folder; leaving a second one dissolves the
 * folder. Stoat's `ordering` keeps a field our client doesn't know throughout. The check servers are swept and every
 * session of the account is revoked.
 */
import { loadState } from '../../seed/src/config.ts';
import { api } from '../../seed/src/http.ts';
import { makeAccount, passwordFor } from '../../seed/src/seed.ts';
import { assertDevStack } from '../../seed/src/vps.ts';
import type { Page } from 'playwright-core';
import { APP, launch, watch } from './browser.ts';
import { signIn } from './login.ts';
import { person, until } from './people.ts';
import { checkServer, sweep } from './servers.ts';

await assertDevStack();
const st = loadState()!;
let failed = 0;
function check(ok: boolean, what: string, detail = ''): void {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ` -> ${detail}` : ''}`);
}

const handle = `fold${Date.now().toString(36)}`;
await makeAccount(handle, handle, st.emailDomain);
const me = await person(handle);
const admin = await person('dev-admin');
await sweep(admin, [me]);
await me.call('POST', `/invites/${st.inviteCode}`);
const a = await checkServer(admin, 'fold a');
const b = await checkServer(admin, 'fold b');
const c = await checkServer(admin, 'fold c');
for (const s of [a, b, c]) await me.call('POST', `/invites/${s.invite}`);
const seeded = st.serverId;
await me.call('POST', `/sync/settings/set?timestamp=${Date.now()}`, { ordering: JSON.stringify({ servers: [seeded, a.id, b.id, c.id], kept: 'yes' }) });
const stored = async (key: string) => {
  const r = await me.call<Record<string, [number, string]>>('POST', '/sync/settings/fetch', { keys: [key] });
  return JSON.parse(r[key]?.[1] ?? '{}') as Record<string, unknown>;
};

const browser = await launch();
const open = async () => {
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 900 } })).newPage();
  const problems = watch(page);
  await signIn(page, handle);
  await page.goto(`${APP}/channels/@me`, { waitUntil: 'networkidle' });
  return { page, problems };
};
const first = await open();
const second = await open();

const names: Record<string, string> = { [seeded]: 'seeded', [a.id]: 'a', [b.id]: 'b', [c.id]: 'c' };
/** The rail's top level: a server by its short name, a folder as [its servers' short names]. */
const rail = (page: Page) => page.evaluate((short) => [...document.querySelectorAll<HTMLElement>('nav[aria-label="Servers"] [data-server], nav[aria-label="Servers"] [data-folder-tile]')]
  .filter((t) => !t.dataset.folder)
  .map((t) => (t.dataset.folderTile ? `[${(t.getAttribute('aria-label') ?? '').split(', folder')[0]}]` : short[t.dataset.server!] ?? t.dataset.server!)).join(' '), names);
/** Check server names are `m2c-check fold a`; the folder label lists them, so shorten them the same way. */
const shorten = (text: string) => text.replace(/m2c-check fold /g, '');
const railIs = async (page: Page, want: string) => until(async () => shorten(await rail(page)) === want, 8_000).then(() => true, () => false);
const tile = (page: Page, id: string) => page.locator(`nav[aria-label="Servers"] [data-server="${id}"]`);
const folderTile = (page: Page) => page.locator('nav[aria-label="Servers"] [data-folder-tile]').first();

async function dragOnto(page: Page, from: { x: number; y: number; width: number; height: number }, to: { x: number; y: number; width: number; height: number }) {
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + ((to.y + to.height / 2 - from.y - from.height / 2) * i) / 10);
  await page.mouse.up();
}

await tile(first.page, c.id).waitFor();
check(await railIs(first.page, 'seeded a b c'), 'the rail starts without folders', shorten(await rail(first.page)));

// b onto a makes a folder where a was.
await dragOnto(first.page, (await tile(first.page, b.id).boundingBox())!, (await tile(first.page, a.id).boundingBox())!);
check(await railIs(first.page, 'seeded [a, b] c'), 'dropping a server on another makes a folder', shorten(await rail(first.page)));
check(await railIs(second.page, 'seeded [a, b] c'), 'the second context shows it live', shorten(await rail(second.page)));
await second.page.reload({ waitUntil: 'networkidle' });
await tile(second.page, c.id).waitFor();
check(await railIs(second.page, 'seeded [a, b] c'), 'and after a reload', shorten(await rail(second.page)));
const folders = (await stored('concord:folders')).folders as { name: string; servers: string[] }[] | undefined;
check(folders?.length === 1 && folders[0]!.servers.join() === [a.id, b.id].join(), 'concord:folders holds the folder', JSON.stringify(folders));

// Rename from the folder's menu.
await folderTile(first.page).click({ button: 'right' });
await first.page.getByRole('menuitem', { name: 'Rename folder' }).click();
const dialog = first.page.getByRole('dialog', { name: 'Rename the folder' });
await dialog.getByLabel('Folder name').fill('Pelit');
await dialog.getByRole('button', { name: 'Save' }).click();
check(await railIs(first.page, 'seeded [Pelit] c'), 'renaming from the menu names the folder', shorten(await rail(first.page)));
check(await railIs(second.page, 'seeded [Pelit] c'), 'the second context follows', shorten(await rail(second.page)));

// Open it, then drag c onto the folder's tile.
await folderTile(first.page).click();
check(await tile(first.page, a.id).isVisible() && (await folderTile(first.page).getAttribute('aria-expanded')) === 'true', 'clicking the folder opens it');
await dragOnto(first.page, (await tile(first.page, c.id).boundingBox())!, (await folderTile(first.page).boundingBox())!);
await until(async () => ((await stored('concord:folders')).folders as { servers: string[] }[] | undefined)?.[0]?.servers.length === 3, 8_000).catch(() => {});
const three = ((await stored('concord:folders')).folders as { servers: string[] }[] | undefined)?.[0]?.servers ?? [];
check(three.join() === [a.id, b.id, c.id].join(), 'dropping a server on the folder adds it', three.map((id) => names[id]).join());
check(await railIs(second.page, 'seeded [Pelit]'), 'the second context shows it in the folder', shorten(await rail(second.page)));

// Leaving c drops it from the folder; leaving b leaves a folder of one, which dissolves.
await me.call('DELETE', `/servers/${c.id}?leave_silently=true`);
await until(async () => (await tile(first.page, c.id).count()) === 0, 8_000).catch(() => {});
check(await tile(first.page, c.id).count() === 0 && await railIs(first.page, 'seeded [Pelit]'), 'a server left drops out of its folder');
await me.call('DELETE', `/servers/${b.id}?leave_silently=true`);
check(await railIs(first.page, 'seeded a'), 'a folder left with one server dissolves', shorten(await rail(first.page)));
check(await railIs(second.page, 'seeded a'), 'in the second context too', shorten(await rail(second.page)));
check((await stored('ordering')).kept === 'yes', 'Stoat’s ordering still keeps the other field');

const errors = [...first.problems.console, ...second.problems.console].filter((x) => !x.includes('429'));
check(errors.length === 0, 'no console errors but rate-limit waits', errors.slice(0, 3).join(' | '));
await browser.close();
await sweep(admin, [me]);
const ticket = await api<{ token: string }>('PUT', '/auth/mfa/ticket', { auth: { session: me.token }, body: { password: passwordFor(handle) } });
await api('DELETE', '/auth/session/all', { auth: { session: me.token }, headers: { 'x-mfa-ticket': ticket.token } }).catch(() => {});
console.log(failed ? `folders: ${failed} failed` : 'folders: all passed');
process.exit(failed ? 1 : 0);
