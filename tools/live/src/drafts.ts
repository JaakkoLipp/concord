/**
 * M4.8 task 7 on the local stack: `node tools/live/src/drafts.ts`. `dev` types in a channel and reloads at once
 * (the `pagehide` write) and after a pause (the debounced write): the text comes back each time, and a second
 * channel keeps its own. A collapsed category stays collapsed after a reload, with its read channels hidden. Logging
 * out wipes the stored drafts, and signing in again opens an empty composer. The category is expanded again at the end.
 */
import { loadState } from '../../seed/src/config.ts';
import { assertDevStack } from '../../seed/src/vps.ts';
import { APP, launch, watch } from './browser.ts';
import { signIn } from './login.ts';
import { person, until } from './people.ts';

await assertDevStack();
const st = loadState()!;
const ch = st.channels;
let failed = 0;
function check(ok: boolean, what: string, detail = ''): void {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ` -> ${detail}` : ''}`);
}

// The category's channels read, so collapsing it hides them (a collapsed category still shows unread ones).
const dev = await person('dev');
for (const c of [ch.tekniikka!, ch.botti!]) {
  const last = (await dev.call<{ last_message_id?: string }>('GET', `/channels/${c}`)).last_message_id;
  if (last) await dev.call('PUT', `/channels/${c}/ack/${last}`);
}

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
const problems = watch(page);
await signIn(page, 'dev');

const tag = Date.now().toString(36);
const composer = page.locator('.composer .cm-content');
const composerText = () => page.evaluate(() => {
  const content = document.querySelector('.composer .cm-content');
  if (!content) return null;
  const copy = content.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('.cm-placeholder').forEach((n) => n.remove());
  return copy.innerText.replace(/\n$/, '');
});
const textIs = (want: string) => until(async () => (await composerText()) === want, 6_000).then(() => true, () => false);
const open = async (channel: string) => {
  await page.goto(`${APP}/channels/${st.serverId}/${channel}`, { waitUntil: 'networkidle' });
  await composer.waitFor();
};
const clear = async () => {
  await composer.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
};

// Reloading straight after typing: only the pagehide write can have stored it.
await open(ch.yleinen!);
await composer.click();
await page.keyboard.type(`heti ${tag}`);
await page.reload({ waitUntil: 'networkidle' });
await composer.waitFor();
check(await textIs(`heti ${tag}`), 'a draft typed just before a reload comes back', JSON.stringify(await composerText()));

// After a pause: the debounced write.
await clear();
await page.keyboard.type(`tauko ${tag}`);
await page.waitForTimeout(1_500);
await open(ch.offtopic!);
await composer.click();
await page.keyboard.type(`toinen ${tag}`);
await page.waitForTimeout(1_500);
await page.reload({ waitUntil: 'networkidle' });
await composer.waitFor();
check(await textIs(`toinen ${tag}`), 'the second channel’s draft comes back after a reload', JSON.stringify(await composerText()));
await open(ch.yleinen!);
check(await textIs(`tauko ${tag}`), 'the first channel keeps its own draft', JSON.stringify(await composerText()));

// Collapsing a category, then reloading.
const category = page.locator('nav[aria-label="Channels"] button.category', { hasText: 'Tekniikka' });
const channelShown = (name: string) => page.locator('nav[aria-label="Channels"] a.channel', { hasText: name }).count().then((n) => n > 0);
await category.click();
await until(async () => !(await channelShown('botti')), 4_000).catch(() => {});
check(!(await channelShown('botti')) && !(await channelShown('tekniikka')), 'collapsing a category hides its read channels');
await page.reload({ waitUntil: 'networkidle' });
await category.waitFor();
check((await category.getAttribute('aria-expanded')) === 'false', 'the category is still collapsed after a reload');
check(!(await channelShown('botti')) && !(await channelShown('tekniikka')), 'and its read channels stay hidden');
await category.click();
await until(async () => channelShown('botti'), 4_000).catch(() => {});
check(await channelShown('botti'), 'expanding it shows them again');

// Logging out wipes them.
check(await page.evaluate(() => localStorage.getItem('concord:drafts') !== null), 'drafts are stored while signed in');
// Not the profile section: its editor throws as the account goes (a separate, older bug).
await page.goto(`${APP}/settings/notifications`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Log out' }).first().click();
await page.waitForURL(/\/app\/login/, { waitUntil: 'commit' });
check(await page.evaluate(() => localStorage.getItem('concord:drafts') === null), 'logging out removes the stored drafts');
await signIn(page, 'dev');
await open(ch.yleinen!);
await page.waitForTimeout(800);
check((await composerText()) === '', 'after signing in again the composer is empty', JSON.stringify(await composerText()));

// The reloads here go past Stoat's 5-in-10-seconds server bucket; the client waits out each 429 and asks again.
const errors = problems.console.filter((c) => !c.includes('429'));
check(errors.length === 0, 'no console errors but rate-limit waits', [...errors.slice(0, 3), ...problems.failed.filter((f) => !f.startsWith('429')).slice(0, 3)].join(' | '));
await browser.close();
console.log(failed ? `drafts: ${failed} failed` : 'drafts: all passed');
process.exit(failed ? 1 : 0);
