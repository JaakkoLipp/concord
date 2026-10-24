/**
 * M4.8 task 13 on the local stack: `node tools/live/src/notes.ts`. A throwaway account in the seeded server signs in
 * in two browser contexts and opens the same member's profile in both. A note typed in the first is stored in
 * `concord:notes`, shows live in the second, and is there after a reload. Clearing it removes it. Every session of
 * the account is revoked at the end.
 */
import { loadState } from '../../seed/src/config.ts';
import { api } from '../../seed/src/http.ts';
import { makeAccount, passwordFor } from '../../seed/src/seed.ts';
import { assertDevStack } from '../../seed/src/vps.ts';
import type { Page } from 'playwright-core';
import { APP, launch, watch } from './browser.ts';
import { signIn } from './login.ts';
import { person, until } from './people.ts';

await assertDevStack();
const st = loadState()!;
let failed = 0;
function check(ok: boolean, what: string, detail = ''): void {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ` -> ${detail}` : ''}`);
}

const handle = `note${Date.now().toString(36)}`;
await makeAccount(handle, handle, st.emailDomain);
const me = await person(handle);
const dev = await person('dev');
await me.call('POST', `/invites/${st.inviteCode}`);
const stored = async () => {
  const r = await me.call<Record<string, [number, string]>>('POST', '/sync/settings/fetch', { keys: ['concord:notes'] });
  return (JSON.parse(r['concord:notes']?.[1] ?? '{}') as { notes?: Record<string, string> }).notes ?? {};
};

const browser = await launch();
const open = async () => {
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const problems = watch(page);
  await signIn(page, handle);
  await page.goto(`${APP}/channels/${st.serverId}/${st.channels.yleinen}`, { waitUntil: 'networkidle' });
  return { page, problems };
};
// dev's avatar shows by its file ID, or by dev's ID when there is none: a server avatar, then the account's own.
const devMember = await dev.call<{ avatar?: { _id: string } }>('GET', `/servers/${st.serverId}/members/${dev.id}`);
const devUser = await dev.call<{ avatar?: { _id: string } }>('GET', `/users/${dev.id}`);
const devAvatar = devMember.avatar?._id ?? devUser.avatar?._id ?? dev.id;
/** Opens dev's profile from the member list and returns its note field. */
const profileNote = async (page: Page) => {
  await page.locator(`aside.members button.member`).filter({ has: page.locator('.name') }).first().waitFor();
  const name = await page.evaluate((id) => [...document.querySelectorAll<HTMLElement>('aside.members button.member')]
    .find((b) => b.querySelector('img')?.getAttribute('src')?.includes(id))?.getAttribute('aria-label') ?? '', devAvatar);
  // Any other member could be this account itself, whose own profile has no note.
  if (!name) throw new Error(`dev isn't in the member list (avatar ${devAvatar})`);
  await page.getByRole('button', { name, exact: true }).first().click();
  const note = page.getByRole('textbox', { name: /^Note about / });
  await note.waitFor();
  return note;
};

const first = await open();
const second = await open();
const noteA = await profileNote(first.page);
const noteB = await profileNote(second.page);
const text = `Met at the sauna ${Date.now().toString(36)}`;
await noteA.fill(text);
await first.page.keyboard.press('Escape');
await until(async () => Object.values(await stored()).includes(text), 8_000).catch(() => {});
const saved = await stored();
check(Object.values(saved).includes(text), 'the note is stored in concord:notes', JSON.stringify(saved));
await until(async () => (await noteB.inputValue()) === text, 8_000).catch(() => {});
check((await noteB.inputValue()) === text, 'the second context shows it live', await noteB.inputValue());

await second.page.reload({ waitUntil: 'networkidle' });
const again = await profileNote(second.page);
await until(async () => (await again.inputValue()) === text, 8_000).catch(() => {});
check((await again.inputValue()) === text, 'and after a reload', await again.inputValue());

await again.fill('');
await again.blur();
await until(async () => Object.keys(await stored()).length === 0, 8_000).catch(() => {});
check(Object.keys(await stored()).length === 0, 'clearing it removes it', JSON.stringify(await stored()));

const errors = [...first.problems.console, ...second.problems.console].filter((x) => !x.includes('429'));
check(errors.length === 0, 'no console errors but rate-limit waits', errors.slice(0, 3).join(' | '));
await browser.close();
const ticket = await api<{ token: string }>('PUT', '/auth/mfa/ticket', { auth: { session: me.token }, body: { password: passwordFor(handle) } });
await api('DELETE', '/auth/session/all', { auth: { session: me.token }, headers: { 'x-mfa-ticket': ticket.token } }).catch(() => {});
console.log(failed ? `notes: ${failed} failed` : 'notes: all passed');
process.exit(failed ? 1 : 0);
