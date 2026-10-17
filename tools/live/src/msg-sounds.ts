/**
 * M4.8 task 11 on the local stack: `node tools/live/src/msg-sounds.ts`. A headless browser can't hear, so a spy on
 * `createOscillator` records each tone's frequency: 1175 Hz is only in the message sound, 1568 Hz only in the
 * mention sound. A throwaway account in two check servers, A set to "All messages" and B left at the default, with
 * desktop notifications off, after a click on the page (browsers play audio only after one): a message in A's other channel sounds once, one in the channel it is looking at
 * doesn't, and an @everyone in B makes a mention sound and a badge. After it turns on "Ignore @everyone and role
 * mentions" in B's Notification settings submenu, another @everyone makes no sound and no badge, while a mention by
 * name still does both. The check servers are swept and every session of the account is revoked.
 */
import { loadState } from '../../seed/src/config.ts';
import { api } from '../../seed/src/http.ts';
import { makeAccount, passwordFor } from '../../seed/src/seed.ts';
import { assertDevStack } from '../../seed/src/vps.ts';
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

const handle = `snd${Date.now().toString(36)}`;
await makeAccount(handle, handle, st.emailDomain);
const me = await person(handle);
const admin = await person('dev-admin');
await sweep(admin, [me]);
const a = await checkServer(admin, 'sounds a');
const b = await checkServer(admin, 'sounds b');
for (const s of [a, b]) await me.call('POST', `/invites/${s.invite}`);
const other = (await admin.call<{ _id: string }>('POST', `/servers/${a.id}/channels`, { type: 'Text', name: 'toinen' }))._id;
await me.call('POST', `/sync/settings/set?timestamp=${Date.now()}`, { notifications: JSON.stringify({ server: { [a.id]: 'all' }, channel: {} }) });

const browser = await launch();
const context = await browser.newContext({ viewport: { width: 1300, height: 900 } });
await context.addInitScript(() => {
  const w = window as unknown as { tones: number[] };
  w.tones = [];
  const create = AudioContext.prototype.createOscillator;
  AudioContext.prototype.createOscillator = function (this: AudioContext) {
    const osc = create.call(this);
    const start = osc.start.bind(osc);
    osc.start = (when?: number) => { w.tones.push(osc.frequency.value); start(when); };
    return osc;
  };
});
const page = await context.newPage();
const problems = watch(page);
await signIn(page, handle);
await page.goto(`${APP}/channels/${a.id}/${a.general}`, { waitUntil: 'networkidle' });
await page.locator('.composer').first().waitFor();
await page.bringToFront();
// Browsers play audio only after the page has had a click or a key; a person reading would have given one.
await page.locator('.composer').first().click();
// The notification leader takes its Web Lock just after start.
await page.waitForTimeout(1_500);

const tones = () => page.evaluate(() => (window as unknown as { tones: number[] }).tones);
const sounds = async () => {
  const t = await tones();
  return { message: t.filter((f) => f === 1175).length, mention: t.filter((f) => f === 1568).length };
};
const post = (channel: string, content: string) => admin.call('POST', `/channels/${channel}/messages`, { content });
const gap = () => new Promise((r) => setTimeout(r, 1_600));
const badge = async () => {
  const label = (await page.locator(`nav[aria-label="Servers"] [data-server="${b.id}"]`).getAttribute('aria-label')) ?? '';
  return Number(/(\d+) mention/.exec(label)?.[1] ?? 0);
};

await post(other, 'hei toisella kanavalla');
check(await until(async () => (await sounds()).message === 1, 6_000).then(() => true, () => false), 'a message in another channel makes one message sound', JSON.stringify(await sounds()));
await gap();
await post(a.general, 'hei tällä kanavalla');
await gap();
check((await sounds()).message === 1, 'a message in the channel being looked at makes none', JSON.stringify(await sounds()));

await post(b.general, '@everyone kaikille');
check(await until(async () => (await sounds()).mention === 1, 6_000).then(() => true, () => false), 'an @everyone makes a mention sound', JSON.stringify(await sounds()));
check(await until(async () => (await badge()) === 1, 6_000).then(() => true, () => false), 'and a mention badge on the server', String(await badge()));

// Ignore @everyone and role mentions in B, from the Notification settings submenu of its menu.
await page.locator(`nav[aria-label="Servers"] [data-server="${b.id}"]`).click({ button: 'right' });
await page.getByRole('menuitem', { name: /^Notification settings/ }).click();
await page.getByRole('menuitemcheckbox', { name: 'Ignore @everyone and role mentions' }).click();
await until(async () => {
  const r = await me.call<Record<string, [number, string]>>('POST', '/sync/settings/fetch', { keys: ['concord:mentions'] });
  return (JSON.parse(r['concord:mentions']?.[1] ?? '{}') as { ignore?: Record<string, boolean> }).ignore?.[b.id] === true;
}, 6_000).then(() => check(true, 'the choice is stored in concord:mentions'), () => check(false, 'the choice is stored in concord:mentions'));

await gap();
await post(b.general, '@everyone taas kaikille');
await gap();
check((await sounds()).mention === 1 && (await sounds()).message === 1, 'with it on, an @everyone makes no sound', JSON.stringify(await sounds()));
check((await badge()) === 1, 'and no badge', String(await badge()));
await post(b.general, `<@${me.id}> sinulle`);
check(await until(async () => (await sounds()).mention === 2, 6_000).then(() => true, () => false), 'a mention by name still makes a mention sound', JSON.stringify(await sounds()));
check(await until(async () => (await badge()) === 2, 6_000).then(() => true, () => false), 'and a badge', String(await badge()));

const errors = problems.console.filter((x) => !x.includes('429'));
check(errors.length === 0, 'no console errors but rate-limit waits', errors.slice(0, 3).join(' | '));
await browser.close();
await sweep(admin, [me]);
const ticket = await api<{ token: string }>('PUT', '/auth/mfa/ticket', { auth: { session: me.token }, body: { password: passwordFor(handle) } });
await api('DELETE', '/auth/session/all', { auth: { session: me.token }, headers: { 'x-mfa-ticket': ticket.token } }).catch(() => {});
console.log(failed ? `msg-sounds: ${failed} failed` : 'msg-sounds: all passed');
process.exit(failed ? 1 : 0);
