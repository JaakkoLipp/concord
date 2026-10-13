/**
 * Live presence on the deployment (M1 task 7, extended for m2b-plan.md task 1). `dev` keeps the server open
 * in the browser while others act over the API:
 * - `lotta`, not dev's friend, sets a Busy status with text: the member list shows it (Subscribe).
 * - `tuuli` sends dev a friend request, then dev's second device changes dev's status: the dock shows it,
 *   although Stoat's socket bug would drop it without a fresh Subscribe.
 * - `onni` becomes dev's friend while the socket is open, then changes status: the member list shows it.
 * - With lotta's popout open, lotta changes her bio: the popout shows it without a reload.
 * Everything changed is put back. `node tools/live/src/presence.ts [out-dir]`
 */
import { join } from 'node:path';
import { loadState } from '../../seed/src/config.ts';
import { APP, launch, watch } from './browser.ts';
import { signIn } from './login.ts';
import { online, person, unrelate, until } from './people.ts';

const out = process.argv[2] ?? '.';
const st = loadState()!;
const tag = () => String(Date.now() % 100000);
const results: Record<string, unknown> = {};

const [dev, dev2, lotta, tuuli, onni] = await Promise.all(['dev', 'dev', 'lotta', 'tuuli', 'onni'].map(person));
await unrelate(dev!, tuuli!);
await unrelate(dev!, onni!);
type Me = { status?: { text?: string; presence?: string } };
const devBefore = await dev!.call<Me>('GET', '/users/@me');
const lottaBefore = await lotta!.call<{ content?: string }>('GET', `/users/${lotta!.id}/profile`);

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const problems = watch(page);
await signIn(page, 'dev');
await page.goto(`${APP}/channels/${st.serverId}/${st.channels.yleinen}`, { waitUntil: 'networkidle' });
await page.getByText('Connected').waitFor({ timeout: 15_000 }).catch(() => {});
const members = page.locator('aside[aria-label=Members]');
const sockets = await Promise.all([lotta!, onni!].map(online));
await page.waitForTimeout(1500);

/** Milliseconds from just before an action until the page shows its result. */
const timed = async (action: () => Promise<unknown>, check: () => Promise<boolean>) => {
  const start = performance.now();
  await action();
  await until(check);
  return Math.round(performance.now() - start);
};

// A non-friend's status, through Subscribe.
const lottaText = `Tilaustesti ${tag()}`;
results.nonFriendStatusMs = await timed(() => lotta!.call('PATCH', '/users/@me', { status: { text: lottaText, presence: 'Busy' } }), () => members.getByText(lottaText).isVisible());

// Own status from a second device, after a friend request reached this socket. On a DM page, where only
// the every-server Subscribe repairs the socket.
await page.goto(`${APP}/channels/@me/${st.channels['dm-aino']}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await tuuli!.call('POST', '/users/friend', { username: dev!.tag });
await page.waitForTimeout(1000);
const devText = `Toinen laite ${tag()}`;
results.ownStatusAfterRequestMs = await timed(() => dev2!.call('PATCH', '/users/@me', { status: { text: devText, presence: 'Idle' } }), () => page.locator('.dock').getByText(devText).isVisible());
await page.goto(`${APP}/channels/${st.serverId}/${st.channels.yleinen}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

// A friendship formed while the socket is open, then the new friend's status.
await onni!.call('POST', '/users/friend', { username: dev!.tag });
await dev!.call('PUT', `/users/${onni!.id}/friend`);
await page.waitForTimeout(1000);
const onniText = `Uusi ystävä ${tag()}`;
results.newFriendStatusMs = await timed(() => onni!.call('PATCH', '/users/@me', { status: { text: onniText, presence: 'Online' } }), () => members.getByText(onniText).isVisible());

// A non-friend's bio in an open popout.
await members.getByRole('button', { name: /Lotta Saarinen/ }).click();
await page.locator('.card.popout').waitFor();
// lotta's edit bucket allows 2 per 10 s, and the API helper waits out an emptied bucket: let it refill.
await page.waitForTimeout(10_000);
const bio = `Uusi bio ${tag()}`;
results.nonFriendBioMs = await timed(() => lotta!.call('PATCH', '/users/@me', { profile: { content: bio } }), () => page.locator('.card.popout').getByText(bio).isVisible());
await page.screenshot({ path: join(out, 'presence-popout.png') });
await page.keyboard.press('Escape');

// Put everything back.
await unrelate(dev!, tuuli!);
await unrelate(dev!, onni!);
const restoreStatus = (b: Me) => ({
  status: { presence: b.status?.presence ?? 'Online', ...(b.status?.text ? { text: b.status.text } : {}) },
  ...(b.status?.text ? {} : { remove: ['StatusText'] }),
});
await dev!.call('PATCH', '/users/@me', restoreStatus(devBefore));
await lotta!.call('PATCH', '/users/@me', lottaBefore.content
  ? { status: { presence: 'Online' }, remove: ['StatusText'], profile: { content: lottaBefore.content } }
  : { status: { presence: 'Online' }, remove: ['StatusText', 'ProfileContent'] });
await onni!.call('PATCH', '/users/@me', { status: { presence: 'Online' }, remove: ['StatusText'] });
sockets.forEach((s) => s.close());
console.log(JSON.stringify({ ...results, ...problems }, null, 2));
await browser.close();
