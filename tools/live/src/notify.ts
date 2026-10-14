/**
 * m2c-plan.md task 8 on the live deployment: `dev` in a browser whose `Notification` is recorded and whose
 * window focus the script controls; `tuuli` writes over the API in a fresh check server with two channels.
 * dev's own notification settings and status are saved first and put back at the end.
 * `node tools/live/src/notify.ts [out-dir]`
 */
import { join } from 'node:path';
import type { Page } from 'playwright-core';
import { APP, launch, watch } from './browser.ts';
import { signIn } from './login.ts';
import { person } from './people.ts';
import { checkServer, sweep } from './servers.ts';
import { Permission as P } from '../../../packages/domain/src/permissions.ts';

const out = process.argv[2] ?? '.';
const results: Record<string, unknown> = {};
const [admin, tuuli, dev] = await Promise.all(['dev-admin', 'tuuli', 'dev'].map(person));
results.sweptBefore = await sweep(admin!, [tuuli!, dev!]);
const savedSettings = await dev!.call<Record<string, [number, string]>>('POST', '/sync/settings/fetch', { keys: ['notifications'] });
const savedStatus = (await dev!.call<{ status?: { presence?: string } }>('GET', '/users/@me')).status?.presence ?? 'Online';

const s = await checkServer(admin!, `notify ${Date.now() % 100000}`, true);
const other = (await admin!.call<{ _id: string }>('POST', `/servers/${s.id}/channels`, { type: 'Text', name: 'muut' }))._id;
const loud = (await admin!.call<{ id: string }>('POST', `/servers/${s.id}/roles`, { name: 'Äänekäs' })).id;
await admin!.call('PUT', `/servers/${s.id}/permissions/${loud}`, { permissions: { allow: Number(P.MentionEveryone | P.MentionRoles), deny: 0 } });
const players = (await admin!.call<{ id: string }>('POST', `/servers/${s.id}/roles`, { name: 'Pelaajat' })).id;
for (const p of [tuuli!, dev!]) await p.call('POST', `/invites/${s.invite}`);
await admin!.call('PATCH', `/servers/${s.id}/members/${tuuli!.id}`, { roles: [loud] });
await admin!.call('PATCH', `/servers/${s.id}/members/${dev!.id}`, { roles: [players] });

const browser = await launch();
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
// A recorded Notification, and focus the script decides.
await context.addInitScript(() => {
  const w = window as unknown as { __notes: unknown[]; __focused: boolean; __last: { onclick?: () => void } | null };
  w.__notes = [];
  w.__focused = true;
  w.__last = null;
  class Recorded {
    static permission = 'default';
    static requestPermission() { Recorded.permission = 'granted'; return Promise.resolve('granted'); }
    onclick: (() => void) | null = null;
    constructor(title: string, opts: { body?: string; tag?: string; icon?: string }) {
      w.__notes.push({ title, body: opts.body, tag: opts.tag, path: location.pathname });
      w.__last = this as unknown as { onclick?: () => void };
    }
    close() {}
  }
  (window as unknown as { Notification: unknown }).Notification = Recorded;
  document.hasFocus = () => w.__focused;
});
const page = await context.newPage();
const problems = watch(page);
await signIn(page, 'dev');
await page.goto(`${APP}/channels/${s.id}/${s.general}`, { waitUntil: 'networkidle' });
await page.getByText('Connected').waitFor({ timeout: 15_000 }).catch(() => {});

const notes = (p: Page = page) => p.evaluate(() => (window as unknown as { __notes: { title: string; body: string; tag: string }[] }).__notes);
const focus = (on: boolean, p: Page = page) => p.evaluate((v) => { (window as unknown as { __focused: boolean }).__focused = v; window.dispatchEvent(new Event(v ? 'focus' : 'blur')); }, on);
let n = 0;
/** tuuli sends; returns whether dev got a notification for it within a second and a half. */
async function sends(channel: string, text: string, pages: Page[] = [page]): Promise<number> {
  const marker = `${text} #${++n}-${Date.now() % 10000}`;
  await tuuli!.call('POST', `/channels/${channel}/messages`, { content: marker });
  await new Promise((r) => setTimeout(r, 1_500));
  let count = 0;
  for (const p of pages) count += (await notes(p)).filter((x) => x.body?.includes(marker.split(' ').at(-1)!)).length;
  return count;
}
const mention = `<@${dev!.id}>`;

// 1. The bar asks once; Enable turns them on.
results.barShown = await page.getByText('Concord can show desktop notifications while it is open.').isVisible();
await page.getByRole('button', { name: 'Enable', exact: true }).click();
await page.getByText('Concord can show desktop notifications while it is open.').waitFor({ state: 'hidden' });

// 2. The default for server channels is mentions only.
await focus(false);
const cases: Record<string, number> = {};
cases.plainDefault = await sends(other, 'tavallinen');
cases.mentionDefault = await sends(other, `${mention} hei`);
const first = (await notes()).at(-1)!;
results.firstNotification = { title: first.title, body: first.body, tag: first.tag === other };
cases.roleMention = await sends(other, `<%${players}> pelataanko`);

// 3. All messages in #muut, through the dialog.
await page.locator('nav[aria-label="Channels"] a.channel', { hasText: 'muut' }).click({ button: 'right' });
await page.getByRole('menuitem', { name: 'Notification settings' }).click();
await page.locator('dialog[open]').getByRole('radio', { name: 'All messages', exact: true }).check();
await page.locator('dialog[open]').getByRole('button', { name: 'Done' }).click();
await new Promise((r) => setTimeout(r, 1_000));
cases.plainAll = await sends(other, 'kaikki');

// 4. The open channel while focused, then not focused.
await focus(true);
cases.openFocused = await sends(s.general, `${mention} auki`);
await focus(false);
cases.openUnfocused = await sends(s.general, `${mention} tausta`);

// 5. Busy and Focus, set as another client would.
await dev!.call('PATCH', '/users/@me', { status: { presence: 'Busy' } });
await new Promise((r) => setTimeout(r, 800));
cases.busyMention = await sends(other, `${mention} kiire`);
await dev!.call('PATCH', '/users/@me', { status: { presence: 'Focus' } });
await new Promise((r) => setTimeout(r, 800));
cases.focusPlain = await sends(other, 'keskity');
cases.focusEveryone = await sends(other, '@everyone keskity');
await dev!.call('PATCH', '/users/@me', { status: { presence: 'Online' } });
await new Promise((r) => setTimeout(r, 800));

// 6. Mute #muut: only a personal mention gets through.
await page.locator('nav[aria-label="Channels"] a.channel', { hasText: 'muut' }).click({ button: 'right' });
await page.getByRole('menuitem', { name: 'Mute channel' }).click();
await new Promise((r) => setTimeout(r, 1_000));
results.mutedDimmed = await page.locator('nav[aria-label="Channels"] a.channel.muted', { hasText: 'muut' }).isVisible();
cases.mutedPlain = await sends(other, 'hiljaa');
cases.mutedEveryone = await sends(other, '@everyone hiljaa');
cases.mutedPersonal = await sends(other, `${mention} hiljaa`);
await page.locator('nav[aria-label="Channels"] a.channel', { hasText: 'muut' }).click({ button: 'right' });
await page.getByRole('menuitem', { name: 'Unmute channel' }).click();
await new Promise((r) => setTimeout(r, 1_000));

// 7. Two tabs: one notification, and none while the other tab is focused on that channel.
const second = await context.newPage();
await second.goto(`${APP}/channels/${s.id}/${other}`, { waitUntil: 'networkidle' });
await second.getByText('Connected').waitFor({ timeout: 15_000 }).catch(() => {});
await focus(false, second);
cases.twoTabs = await sends(other, 'kaksi välilehteä', [page, second]);
await focus(true, second);
await new Promise((r) => setTimeout(r, 500));
cases.otherTabFocused = await sends(other, 'toinen lukee', [page, second]);
await focus(false, second);
await second.close();
await new Promise((r) => setTimeout(r, 500));

// 8. A mute written in Stoat's own shape, ending by itself a minute later.
const muteEnds = Date.now() + 60_000;
const raw = await dev!.call<Record<string, [number, string]>>('POST', '/sync/settings/fetch', { keys: ['notifications'] });
const value = JSON.parse(raw.notifications?.[1] ?? '{}') as Record<string, Record<string, unknown>>;
value.channel_mutes = { ...(value.channel_mutes ?? {}), [other]: { until: muteEnds } };
await dev!.call('POST', `/sync/settings/set?timestamp=${Date.now()}`, { notifications: JSON.stringify(value) });
await new Promise((r) => setTimeout(r, 1_500));
cases.timedMuteRunning = await sends(other, 'ajastettu');
while (Date.now() < muteEnds + 16_000) await new Promise((r) => setTimeout(r, 1_000));
cases.timedMuteEnded = await sends(other, 'ajastus ohi');

// 9. A click opens the message.
await page.evaluate(() => (window as unknown as { __last: { onclick?: () => void } }).__last.onclick?.());
await page.waitForURL(new RegExp(`/channels/${s.id}/${other}/[0-9A-Z]{26}$`), { timeout: 10_000 });
results.clickOpensMessage = true;

// 10. Round trip: Stoat's client's mutes, and an old "muted" level, survive a change made here.
const legacy = JSON.parse((await dev!.call<Record<string, [number, string]>>('POST', '/sync/settings/fetch', { keys: ['notifications'] })).notifications?.[1] ?? '{}') as Record<string, Record<string, unknown>>;
legacy.server_mutes = { ...(legacy.server_mutes ?? {}), [s.id]: {} };
legacy.channel = { ...(legacy.channel ?? {}), [s.general]: 'muted' };
legacy.someday = { kept: true };
await dev!.call('POST', `/sync/settings/set?timestamp=${Date.now()}`, { notifications: JSON.stringify(legacy) });
await new Promise((r) => setTimeout(r, 2_000));
await page.locator('nav[aria-label="Channels"] a.channel', { hasText: 'muut' }).click({ button: 'right' });
await page.getByRole('menuitem', { name: 'Notification settings' }).click();
await page.locator('dialog[open]').getByRole('radio', { name: 'Only mentions', exact: true }).check();
await page.locator('dialog[open]').getByRole('button', { name: 'Done' }).click();
await new Promise((r) => setTimeout(r, 2_500));
const after = JSON.parse((await dev!.call<Record<string, [number, string]>>('POST', '/sync/settings/fetch', { keys: ['notifications'] })).notifications?.[1] ?? '{}') as Record<string, Record<string, unknown>>;
results.roundTrip = {
  serverMuteKept: !!after.server_mutes?.[s.id],
  legacyBecameMute: !!after.channel_mutes?.[s.general] && after.channel?.[s.general] === undefined,
  levelWritten: after.channel?.[other] === 'mention',
  unknownKeyKept: !!after.someday,
};
results.cases = cases;
await page.screenshot({ path: join(out, 'notify.png') });

// Put dev back.
if (savedSettings.notifications) await dev!.call('POST', `/sync/settings/set?timestamp=${Date.now()}`, { notifications: savedSettings.notifications[1] });
await dev!.call('PATCH', '/users/@me', { status: { presence: savedStatus } });
results.sweptAfter = await sweep(admin!, [tuuli!, dev!]);
console.log(JSON.stringify({ ...results, problems }, null, 2));
await browser.close();
