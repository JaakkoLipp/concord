/**
 * m4.5-plan.md task 8 on the local dev stack, in the seeded Olohuone:
 * - `dev-admin` sets a user limit of 2 in the channel's settings; `dev` and `aino` join, and `ben` gets
 *   "This voice channel is full",
 * - with Speak denied in the channel, `aino` joins and sends nothing; once it is allowed again her microphone
 *   is published within seconds, without a second join_call.
 * The channel's limit and permissions are put back afterwards, whatever happens.
 * Usage: node tools/live/src/voice-channel.ts [screenshot-dir]
 */
import { loadState } from '../../seed/src/config.ts';
import { assertDevStack } from '../../seed/src/vps.ts';
import { Permission } from '../../../packages/domain/src/permissions.ts';
import { APP } from './browser.ts';
import { join, passes, seat, sending, voiceBrowser, type Seat } from './calls.ts';
import { person } from './people.ts';

// Changes a seeded channel and joins calls as seeded personas: never against production.
await assertDevStack();
const st = loadState()!;
const channel = st.channels.olohuone!;
const failures: string[] = [];
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failures.push(what); };

const admin = await person('dev-admin');
type WChannel = { voice?: { max_users?: number | null }; default_permissions?: { a: number; d: number } | null };
const before = await admin.call<WChannel>('GET', `/channels/${channel}`);
// BigInt, since Speak is bit 31, which a plain bitwise OR would turn negative.
const setDefault = (deny: bigint) => admin.call('PUT', `/channels/${channel}/permissions/default`, {
  permissions: { allow: before.default_permissions?.a ?? 0, deny: Number(deny | BigInt(before.default_permissions?.d ?? 0)) },
});

const browser = await voiceBrowser();
const seats: Seat[] = [];
const leave = async (s: Seat) => { await s.page.locator('section[aria-label="Voice call"]').getByRole('button', { name: /^(Disconnect|Dismiss)$/ }).click({ timeout: 3_000 }).catch(() => {}); };
try {
  // 1. The user limit, set in the channel's settings.
  const a = await seat(browser, 'dev-admin');
  seats.push(a);
  await a.page.goto(`${APP}/channel-settings/${channel}/overview`, { waitUntil: 'networkidle' });
  const limit = a.page.getByLabel('User limit');
  await limit.fill('2');
  await a.page.getByRole('button', { name: 'Save changes', exact: true }).click();
  const saved = await passes((async () => {
    for (let i = 0; i < 20; i++) {
      if ((await admin.call<WChannel>('GET', `/channels/${channel}`)).voice?.max_users === 2) return;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error('not saved');
  })());
  const stillVoice = !!(await admin.call<WChannel>('GET', `/channels/${channel}`)).voice;
  check(saved && stillVoice, 'a user limit of 2 saves from the channel settings, and the channel stays a voice channel');
  await a.page.keyboard.press('Escape');

  const [dev, aino, ben] = await Promise.all([seat(browser, 'dev'), seat(browser, 'aino'), seat(browser, 'ben')]);
  seats.push(dev, aino, ben);
  await join(dev, 'Olohuone');
  await join(aino, 'Olohuone');
  await ben.page.getByRole('link', { name: /^Olohuone/ }).click();
  const full = await passes(ben.page.getByText('This voice channel is full.').waitFor({ timeout: 10_000 }));
  check(full, 'a third person gets "This voice channel is full."');
  for (const s of [dev, aino, ben]) await leave(s);
  await admin.call('PATCH', `/channels/${channel}`, { voice: { max_users: before.voice?.max_users ?? null } });

  // 2. Speak gained mid-call.
  await setDefault(Permission.Speak);
  await aino.page.reload();
  await join(aino, 'Olohuone');
  const joinsBefore = aino.joins;
  const silent = await sending(aino.page);
  check(silent < 500, `with Speak denied, aino joins and sends nothing (${silent} B/s)`);
  await setDefault(0n);
  let talking = 0;
  const start = Date.now();
  while (Date.now() - start < 20_000 && talking < 2_000) talking = await sending(aino.page);
  check(talking >= 2_000 && aino.joins === joinsBefore, `once Speak is allowed, her microphone is sent within ${Math.round((Date.now() - start) / 1000)} s (${talking} B/s), with no new join_call`);
  await leave(aino);
} catch (e) {
  failures.push(String(e));
  console.log(`FAIL ${String(e).split('\n')[0]}`);
  const out = process.argv[2];
  if (out) for (const [i, s] of seats.entries()) await s.page.screenshot({ path: `${out}/voice-channel-failed-${i}.png` }).catch(() => {});
} finally {
  await admin.call('PATCH', `/channels/${channel}`, { voice: { max_users: before.voice?.max_users ?? null } }).catch(() => {});
  await admin.call('PUT', `/channels/${channel}/permissions/default`, { permissions: { allow: before.default_permissions?.a ?? 0, deny: before.default_permissions?.d ?? 0 } }).catch(() => {});
  await browser.close();
}
console.log(failures.length ? `voice-channel: ${failures.length} failed` : 'voice-channel: all passed');
process.exit(failures.length ? 1 : 0);
