/**
 * M4.8 task 10a on the local stack: `node tools/live/src/servers-order.ts`. A throwaway account in three servers
 * (the seeded one and two check servers) signs in in two browser contexts. In the first it moves a server up with
 * the server menu's Move up, and drags another to the end of the rail. The second context follows each change live,
 * and shows the same order after a reload. Stoat's `ordering` setting keeps a field our client doesn't know. The
 * check servers are swept, and every session of the throwaway account is revoked.
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

const handle = `order${Date.now().toString(36)}`;
await makeAccount(handle, handle, st.emailDomain);
const me = await person(handle);
const admin = await person('dev-admin');
await sweep(admin, [me]);
await me.call('POST', `/invites/${st.inviteCode}`);
const a = await checkServer(admin, 'order a');
const b = await checkServer(admin, 'order b');
await me.call('POST', `/invites/${a.invite}`);
await me.call('POST', `/invites/${b.invite}`);
const seeded = st.serverId;
const names: Record<string, string> = { [seeded]: 'seeded', [a.id]: 'a', [b.id]: 'b' };
const show = (ids: string[]) => ids.map((id) => names[id] ?? id).join(',');

// Stoat's own client keeps more than servers here; a field we don't know must survive our writes.
await me.call('POST', `/sync/settings/set?timestamp=${Date.now()}`, { ordering: JSON.stringify({ servers: [seeded, a.id, b.id], kept: 'yes' }) });
const stored = async () => {
  const r = await me.call<Record<string, [number, string]>>('POST', '/sync/settings/fetch', { keys: ['ordering'] });
  return JSON.parse(r.ordering?.[1] ?? '{}') as { servers?: string[]; kept?: string };
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
const rail = (page: Page) => page.$$eval('nav[aria-label="Servers"] a.item[href*="/channels/"]', (as) =>
  as.map((x) => new URL((x as HTMLAnchorElement).href).pathname.split('/')[3]!).filter((id) => id !== '@me'));
const railIs = (page: Page, want: string[]) => until(async () => show(await rail(page)) === show(want), 8_000).then(() => true, () => false);
const tile = (page: Page, id: string) => page.locator(`nav[aria-label="Servers"] a.item[href*="/channels/${id}/"]`);

await tile(first.page, b.id).waitFor();
check(await railIs(first.page, [seeded, a.id, b.id]), 'the rail starts in the stored order', show(await rail(first.page)));

// The keyboard path: Move up in the server's menu.
await tile(first.page, b.id).click({ button: 'right' });
await first.page.getByRole('menuitem', { name: 'Move up' }).click();
check(await railIs(first.page, [seeded, b.id, a.id]), 'Move up moves the server up', show(await rail(first.page)));
check(await railIs(second.page, [seeded, b.id, a.id]), 'the second context follows live', show(await rail(second.page)));
await until(async () => show((await stored()).servers ?? []) === show([seeded, b.id, a.id]), 8_000).catch(() => {});
let s = await stored();
check(show(s.servers ?? []) === show([seeded, b.id, a.id]) && s.kept === 'yes', 'Stoat stores the order and keeps the other field', JSON.stringify(s));

// Dragging the first server past the last one.
const url = first.page.url();
const from = (await tile(first.page, seeded).boundingBox())!;
const last = (await tile(first.page, a.id).boundingBox())!;
await first.page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
await first.page.mouse.down();
for (let i = 1; i <= 10; i++) await first.page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + ((last.y + last.height - from.y) * i) / 10);
check(await first.page.locator('.drop-line').count() === 1, 'a line marks where it will land');
await first.page.mouse.up();
check(await railIs(first.page, [b.id, a.id, seeded]), 'dragging puts it at the end', show(await rail(first.page)));
check(first.page.url() === url, 'and dropping it doesn’t open it');
check(await railIs(second.page, [b.id, a.id, seeded]), 'the second context follows live', show(await rail(second.page)));
await second.page.reload({ waitUntil: 'networkidle' });
await tile(second.page, b.id).waitFor();
check(await railIs(second.page, [b.id, a.id, seeded]), 'and after a reload', show(await rail(second.page)));
await until(async () => (await stored()).servers?.[0] === b.id, 8_000).catch(() => {});
s = await stored();
check(show(s.servers ?? []) === show([b.id, a.id, seeded]) && s.kept === 'yes', 'Stoat stores it, still keeping the other field', JSON.stringify(s));

const errors = [...first.problems.console, ...second.problems.console].filter((c) => !c.includes('429'));
check(errors.length === 0, 'no console errors but rate-limit waits', errors.slice(0, 3).join(' | '));
await browser.close();
await sweep(admin, [me]);
const ticket = await api<{ token: string }>('PUT', '/auth/mfa/ticket', { auth: { session: me.token }, body: { password: passwordFor(handle) } });
await api('DELETE', '/auth/session/all', { auth: { session: me.token }, headers: { 'x-mfa-ticket': ticket.token } }).catch(() => {});
console.log(failed ? `servers-order: ${failed} failed` : 'servers-order: all passed');
process.exit(failed ? 1 : 0);
