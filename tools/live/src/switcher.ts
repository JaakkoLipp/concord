/**
 * M4.8 task 3 on the local stack: `node tools/live/src/switcher.ts`. Ctrl+K from the composer opens the quick
 * switcher without animating, and takes focus. The empty box lists the recent channels, newest first, and the arrows
 * wrap. A channel of a second server (a throwaway check server, since the seed has one) and a persona with an open DM
 * and one without each land where they should. A channel the persona can't view isn't offered. The DM list's button
 * opens it, a click goes, Ctrl+K closes it, and Esc closes it and returns focus. A throwaway server is swept at both ends.
 */
import { loadState } from '../../seed/src/config.ts';
import { PERSONAS } from '../../seed/src/data.ts';
import { assertDevStack } from '../../seed/src/vps.ts';
import { APP, launch, watch } from './browser.ts';
import { signIn } from './login.ts';
import { person, until } from './people.ts';
import { checkServer, sweep } from './servers.ts';
import { Permission } from '../../../packages/domain/src/permissions.ts';

await assertDevStack();
const st = loadState()!;
const ch = st.channels;
let failed = 0;
function check(ok: boolean, what: string, detail = ''): void {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ` -> ${detail}` : ''}`);
}

const admin = await person('dev-admin');
const dev = await person('dev');
await sweep(admin, [dev]);
// A second server, with the channel the switcher must find by name. Dev joins it as a member would.
const fresh = await checkServer(admin, 'switcher', true);
await dev.call('POST', `/invites/${fresh.invite}`);
const tag = Date.now().toString(36);
const kanava = (await admin.call<{ _id: string }>('POST', `/servers/${fresh.id}/channels`, { type: 'Text', name: `kanava-${tag}` }))._id;

// A persona with an open DM (Aino, seeded), and one without: the first of these that dev has no DM with, so a
// rerun, after the first run has opened one, still takes the person path.
const dms = await dev.call<{ recipients?: string[]; channel_type?: string }[]>('GET', '/users/dms');
const withDm = new Set(dms.flatMap((c) => (c.channel_type === 'DirectMessage' ? c.recipients ?? [] : [])));
const handles = ['ben', 'lauri', 'maija', 'oliver', 'noora', 'ville', 'kaisa', 'tomi', 'riikka', 'mikko'];
const free = handles.find((h) => st.personas[h] && !withDm.has(st.personas[h]!.userId));
if (!free) {
  console.log('FAIL no persona left without a DM (needs a reseed)');
  process.exit(1);
}
const freeName = (PERSONAS.find((p) => p.handle === free)?.displayName ?? free).split(' ')[0]!;

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
const problems = watch(page);
await signIn(page, 'dev');
await page.goto(`${APP}/channels/${st.serverId}/${ch.yleinen}`, { waitUntil: 'networkidle' });
await page.locator('nav[aria-label="Channels"] a.channel').first().waitFor();
await page.locator('.composer .cm-content').waitFor();

const parts = () => new URL(page.url()).pathname.split('/');
const at = (cond: () => boolean | Promise<boolean>) => until(async () => cond(), 6_000).then(() => true, () => false);
const dialogCount = () => page.locator('dialog[open]').count();
const input = () => page.locator('dialog[open] input[role="combobox"]');
const inInput = () => page.evaluate(() => document.activeElement?.matches('dialog[open] input[role="combobox"]') ?? false);
const options = () => page.$$eval('dialog[open] [role="option"]', (els) => els.map((e) => ({
  id: e.getAttribute('data-id'), kind: e.getAttribute('data-kind'), title: e.querySelector('.title')?.textContent ?? '', selected: e.getAttribute('aria-selected') === 'true',
})));
const selectedIndex = async () => (await options()).findIndex((o) => o.selected);
async function openWithKeys(): Promise<void> {
  await page.keyboard.press('Control+k');
  await input().waitFor();
  await at(inInput);
}
const closedNow = () => until(async () => (await dialogCount()) === 0, 4_000).then(() => true, () => false);
const type = (text: string) => page.keyboard.type(text);
const pick = async (where: string) => { await page.locator(`nav[aria-label="Channels"] a.channel[href$="/${where}"]`).click(); };

// Ctrl+K from the composer, with the composer focused: the dialog opens, nothing animates, and the box takes focus.
await page.locator('.composer .cm-content').click();
await page.keyboard.press('Control+k');
await input().waitFor();
const animations = await page.evaluate(() => document.getAnimations().filter((a) => {
  const target = (a.effect as KeyframeEffect | null)?.target as Element | null | undefined;
  return !!target && (target.tagName === 'DIALOG' || !!target.closest?.('dialog'));
}).length);
// Animation name is the timing-free read: the dialog's CSS animation is set for as long as it runs, and none is set here.
const animationName = await page.evaluate(() => getComputedStyle(document.querySelector('dialog[open]')!).animationName);
check(animations === 0 && animationName === 'none' && (await at(inInput)), 'Ctrl+K from the composer opens the switcher with nothing animating, focus in the box', `${animations} animations, animation-name ${animationName}`);

// Esc closes it, and focus goes back to the composer.
await page.keyboard.press('Escape');
const back = await closedNow() && (await page.evaluate(() => !!document.activeElement?.closest('.composer')));
check(back, 'Esc closes it and focus returns to the composer');

// Recent places: the channels visited, newest first, are listed first when the box is empty.
await pick(ch.offtopic!);
await at(() => parts()[4] === ch.offtopic);
await pick(ch.pelit!);
await at(() => parts()[4] === ch.pelit);
await openWithKeys();
const recent = (await options()).slice(0, 3).map((o) => o.id);
check(JSON.stringify(recent) === JSON.stringify([ch.pelit, ch.offtopic, ch.yleinen]), 'the empty box lists the recent channels first, newest first', JSON.stringify(recent));
// The arrows wrap: Up from the first row goes to the last, and Down from the last comes back to the first.
await page.keyboard.press('ArrowUp');
const last = (await options()).length - 1;
const wrapsUp = (await selectedIndex()) === last;
await page.keyboard.press('ArrowDown');
const wrapsDown = (await selectedIndex()) === 0;
check(wrapsUp && wrapsDown, 'Up and Down move the selection and wrap', `${last + 1} rows`);
await page.keyboard.press('Escape');
await closedNow();

// A channel the persona can't view is not offered. It's made after the page loaded and then denied to everyone
// but the owner, so the client first learns of it as a channel and then as one it can't see.
const piilo = (await admin.call<{ _id: string }>('POST', `/servers/${fresh.id}/channels`, { type: 'Text', name: `piilo-${tag}` }))._id;
await page.waitForTimeout(1_500);
// First, a control: while it's viewable, the switcher offers it, so the check after the denial means something.
await openWithKeys();
await type(`piilo-${tag}`.slice(0, 12));
const offeredBefore = await at(async () => (await options()).some((o) => o.title.includes('piilo')));
await page.keyboard.press('Escape');
await closedNow();
await admin.call('PUT', `/channels/${piilo}/permissions/default`, { permissions: { allow: 0, deny: Number(Permission.ViewChannel) } });
await page.waitForTimeout(1_500);
await openWithKeys();
await type(`piilo-${tag}`.slice(0, 12));
await page.waitForTimeout(500);
const hidden = (await options()).filter((o) => o.title.includes('piilo'));
check(offeredBefore, 'the channel is offered while the persona can view it (control)');
check(hidden.length === 0, 'a channel the persona cannot view is not offered', JSON.stringify(hidden));
await page.keyboard.press('Escape');
await closedNow();

// A channel of the second server, by part of its name: Enter lands on its URL.
await openWithKeys();
await type(`kanava-${tag}`.slice(0, 12));
const first = (await options())[0];
check(first?.id === kanava && first.kind === 'channel', 'typing part of a channel name of a second server finds it first', JSON.stringify(first));
await page.keyboard.press('Enter');
// The box's exit animation runs for a moment, and Ctrl+K waits for it (as the other shortcuts wait after a dialog), so wait for it.
await closedNow();
const onKanava = await at(() => parts()[3] === fresh.id && parts()[4] === kanava);
check(onKanava, 'Enter lands on that channel of the second server', `${parts()[3]}/${parts()[4]}`);

// A persona with an open DM: Enter lands in the DM.
await openWithKeys();
await type('Aino');
const aino = (await options())[0];
check(aino?.kind === 'dm' && aino.id === ch['dm-aino'], 'a persona with an open DM is found as that DM', JSON.stringify(aino));
await page.keyboard.press('Enter');
await closedNow();
check(await at(() => parts()[3] === '@me' && parts()[4] === ch['dm-aino']), 'Enter lands in the DM', parts().join('/'));

// A persona with no DM: offered as a person, and Enter opens a conversation, which then shows in the DM list.
await openWithKeys();
await type(freeName);
const person0 = (await options())[0];
check(person0?.kind === 'person' && person0.id === st.personas[free]!.userId, `a persona without a DM is offered to start one (${free})`, JSON.stringify(person0));
await page.keyboard.press('Enter');
await closedNow();
const inDm = await at(() => parts()[3] === '@me' && !!parts()[4] && parts()[4] !== ch['dm-aino']);
const listed = inDm && (await page.locator(`nav.dms .name`).allTextContents()).some((t) => t.includes(PERSONAS.find((p) => p.handle === free)?.displayName ?? free));
check(inDm && listed, 'Enter opens a conversation with that persona, listed in the DM list', parts().join('/'));

// The DM list's button opens the switcher, and animates as any dialog does.
await page.goto(`${APP}/channels/@me`, { waitUntil: 'networkidle' });
await page.locator('button.search').waitFor();
await page.locator('button.search').click();
await input().waitFor();
// The control: this open comes from a click, so the dialog does animate.
const clickAnimation = await page.evaluate(() => getComputedStyle(document.querySelector('dialog[open]')!).animationName);
check(clickAnimation !== 'none' && (await at(inInput)), 'the DM list’s button opens the switcher, which animates as a click does, focus in the box', clickAnimation);
await page.keyboard.press('Escape');
await closedNow();

// A click goes: the open channel from the recent list, found by its ID.
await openWithKeys();
await page.locator(`dialog[open] [role="option"][data-id="${ch.offtopic}"]`).click();
check(await at(() => parts()[4] === ch.offtopic && parts()[3] === st.serverId), 'a click on a row goes there', parts().join('/'));
await closedNow();

// Ctrl+K inside the open switcher closes it.
await page.locator('.composer .cm-content').waitFor();
await openWithKeys();
await page.keyboard.press('Control+k');
check(await closedNow(), 'Ctrl+K inside the open switcher closes it');

check(problems.console.length === 0, 'no console errors', problems.console.slice(0, 3).join(' | '));
await browser.close();
await sweep(admin, [dev]);
console.log(failed ? `switcher: ${failed} failed` : 'switcher: all passed');
process.exit(failed ? 1 : 0);
