/**
 * M4.8 task 2 on the local stack: `node tools/live/src/shortcuts.ts`. `dev` steps through the seeded server's
 * channels with Alt+Up and Alt+Down (wrapping, voice channels opened without a join), through its unread ones with
 * Alt+Shift, and through servers with Ctrl+Alt, a check server it joins. In the composer, Alt+Up changes channel
 * and leaves the text alone. Esc marks the open channel read, but not from the header search, an edit box, an open
 * menu or the settings route. Typing with nothing focused lands in the composer, with the first character intact, and
 * not from the header search, a button, an open menu, picker or dialog, or a channel the persona can't send in. A
 * throwaway server is swept at both ends.
 */
import { loadState } from '../../seed/src/config.ts';
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
const aino = await person('aino');
await sweep(admin, [dev]);
const fresh = await checkServer(admin, 'shortcuts', true);
await dev.call('POST', `/invites/${fresh.invite}`);
// A channel the persona can see but not send in: SendMessage denied to Everyone, as the overrides check does for #säännöt.
const noSend = (await admin.call<{ _id: string }>('POST', `/servers/${fresh.id}/channels`, { type: 'Text', name: `nosend-${Date.now().toString(36)}` }))._id;
await admin.call('PUT', `/channels/${noSend}/permissions/default`, { permissions: { allow: 0, deny: Number(Permission.SendMessage) } });

const tag = Date.now().toString(36);
const post = (who: typeof dev, channel: string, content: string) => who.call<{ _id: string }>('POST', `/channels/${channel}/messages`, { content });
// Posting marks the channel read for its author, so dev's own message comes first, then every seeded server
// channel is read for dev, and only then does aino post: the one unread channel is #pelit.
const own = await post(dev, ch.pelit!, `oma esc-testi ${tag}`);
for (const [key, c] of Object.entries(ch)) {
  if (key.startsWith('dm-')) continue;
  const last = (await dev.call<{ last_message_id?: string }>('GET', `/channels/${c}`).catch(() => null))?.last_message_id;
  if (last) await dev.call('PUT', `/channels/${c}/ack/${last}`).catch(() => {});
}
const aMsg = await post(aino, ch.pelit!, `esc-testi a ${tag}`);
const bMsg = await post(aino, ch.pelit!, `esc-testi b ${tag}`);
// A channel's last message catches up a second or two after a post. The client takes it from its sign-in snapshot, so wait for it.
await until(async () => (await dev.call<{ last_message_id?: string }>('GET', `/channels/${ch.pelit}`)).last_message_id === bMsg._id, 15_000);

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
const problems = watch(page);
await signIn(page, 'dev');
await page.goto(`${APP}/channels/${st.serverId}/${ch.yleinen}`, { waitUntil: 'networkidle' });
await page.locator('nav[aria-label="Channels"] a.channel').first().waitFor();
await page.locator('.composer .cm-content').waitFor();

const path = () => new URL(page.url()).pathname.split('/');
const serverNow = () => path()[3];
const channelNow = () => path()[4];
const press = (key: string) => page.keyboard.press(key);
const sidebar = () => page.$$eval('nav[aria-label="Channels"] a.channel', (as) => as.map((a) => a.getAttribute('href')!.split('/')[4]!));
const wait = (cond: () => boolean) => until(async () => cond(), 6_000).then(() => true, () => false);
const blur = () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

/** Whether dev has read a channel to its newest message, as Stoat's unreads say. */
async function readAt(channel: string): Promise<boolean> {
  const rows = await dev.call<{ _id: { channel: string }; last_id?: string }[]>('GET', '/sync/unreads');
  const last = (await dev.call<{ last_message_id?: string }>('GET', `/channels/${channel}`)).last_message_id;
  return rows.find((r) => r._id.channel === channel)?.last_id === last;
}
const unreadPelit = async () => !(await readAt(ch.pelit!));

async function markUnread(id: string): Promise<void> {
  await blur();
  await page.locator(`#message-${id}`).locator('.content, .body, p').first().click({ button: 'right' });
  const menu = page.getByRole('menu');
  await menu.waitFor();
  await menu.getByRole('menuitem', { name: 'Mark unread', exact: true }).click();
  await page.waitForTimeout(2_500);
}

// Alt+Shift+Down from #yleinen: the one unread channel after it is #pelit (posted to above). Wait for the sidebar to show it unread first.
await page.locator(`nav[aria-label="Channels"] a.channel.unread[href$="/${ch.pelit}"]`).waitFor();
await press('Alt+Shift+ArrowDown');
check(await wait(() => channelNow() === ch.pelit), 'Alt+Shift+Down goes to the unread channel', channelNow());

// Alt+Down from #pelit steps through every channel of the sidebar, in order, and wraps back to #pelit.
const order = await sidebar();
const voices = new Set([ch.olohuone, ch.pelaamo]);
let index = order.indexOf(ch.pelit!);
let walked = true;
const voiceChecks: boolean[] = [];
for (let step = 0; step < order.length; step++) {
  await press('Alt+ArrowDown');
  index = (index + 1) % order.length;
  if (!(await wait(() => channelNow() === order[index]))) { walked = false; break; }
  if (voices.has(order[index]!)) {
    // A voice channel opens its route only: its call view offers to join, and the stepping didn't join.
    await page.waitForTimeout(800);
    voiceChecks.push(await page.getByRole('button', { name: 'Join voice' }).first().isVisible());
  }
}
check(walked && channelNow() === ch.pelit, 'Alt+Down steps through the sidebar in order and wraps', `${order.length} channels, ended on ${channelNow()}`);
check(voiceChecks.length > 0 && voiceChecks.every(Boolean), 'stepping onto a voice channel opens it without joining', `${voiceChecks.length} voice channels`);
await press('Alt+ArrowUp');
check(await wait(() => channelNow() === order[(order.indexOf(ch.pelit!) - 1 + order.length) % order.length]), 'Alt+Up goes back one channel', channelNow());
await page.goto(`${APP}/channels/${st.serverId}/${ch.pelit}`, { waitUntil: 'networkidle' });
await page.locator('.composer .cm-content').waitFor();

// Ctrl+Alt+Down and Up step through the rail, as the rail lists its servers.
const rail = () => page.$$eval('nav[aria-label="Servers"] a.item', (as) => as.map((a) => a.getAttribute('href')!.split('/')[3]!).filter((s) => s !== '@me'));
const servers = await rail();
const here = servers.indexOf(st.serverId);
await press('Control+Alt+ArrowDown');
check(await wait(() => serverNow() === servers[(here + 1) % servers.length]), 'Ctrl+Alt+Down goes to the next server in the rail', serverNow());
await press('Control+Alt+ArrowUp');
check(await wait(() => serverNow() === st.serverId), 'Ctrl+Alt+Up goes back to the seeded server', serverNow());

// The composer: a two-line draft in #off-topic, Alt+Up to #yleinen and back. The draft must come back as typed.
await page.goto(`${APP}/channels/${st.serverId}/${ch.offtopic}`, { waitUntil: 'networkidle' });
const composer = page.locator('.composer .cm-content');
await composer.click();
await page.keyboard.type('rivi yksi');
await press('Shift+Enter');
await page.keyboard.type('rivi kaksi');
const typed = await composer.innerText();
await press('Alt+ArrowUp');
check(await wait(() => channelNow() === ch.yleinen), 'Alt+Up in the composer changes channel', channelNow());
await press('Alt+ArrowDown');
check(await wait(() => channelNow() === ch.offtopic), 'and Alt+Down brings it back');
const back = await page.locator('.composer .cm-content').innerText();
check(back === typed && /rivi yksi\s+rivi kaksi/.test(back), 'Alt+Up leaves the composer text alone', JSON.stringify(back));
// With the autocomplete list open, the Alt keys are the editor's line moves unless the list takes them: nothing
// changes channel, and the lines stay in order.
await composer.click();
await page.keyboard.type(' #yle');
const listed = await page.getByRole('listbox').waitFor().then(() => true, () => false);
const listedText = await composer.innerText();
await press('Alt+ArrowUp');
await page.waitForTimeout(1500);
const listedAfter = await composer.innerText();
check(listed && channelNow() === ch.offtopic && listedAfter === listedText && /rivi yksi\s+rivi kaksi/.test(listedAfter), 'with the autocomplete open, Alt+Up changes neither channel nor lines', JSON.stringify([listed, channelNow(), listedAfter]));
await press('Escape');
await composer.click();
await press('Control+A');
await press('Backspace');

// Esc marks #pelit read, and not from the header search, an edit box, an open menu or the settings route.
await page.goto(`${APP}/channels/${st.serverId}/${ch.pelit}`, { waitUntil: 'networkidle' });
await page.locator('.composer .cm-content').waitFor();
await page.locator(`#message-${own._id}`).waitFor();
await markUnread(bMsg._id);
check(await unreadPelit(), 'Mark unread makes #pelit unread', '');
await blur();
await press('Escape');
check(await until(async () => readAt(ch.pelit!), 15_000).then(() => true, () => false), 'Esc marks the open channel read');

await markUnread(bMsg._id);
const search = page.getByRole('searchbox', { name: 'Search' });
await search.fill('esc');
await search.press('Enter');
await page.locator('.find').waitFor();
await search.focus();
await press('Escape');
await page.waitForTimeout(3_000);
check(await unreadPelit(), 'Esc in the header search doesn’t mark the channel read');

await markUnread(bMsg._id);
const mine = page.locator(`#message-${own._id}`);
await mine.locator('.content, .body, p').first().click({ button: 'right' });
await page.getByRole('menu').getByRole('menuitem', { name: 'Edit', exact: true }).click();
await mine.locator('.cm-content').focus();
await press('Escape');
await mine.locator('.cm-editor').waitFor({ state: 'detached' });
await page.waitForTimeout(2_500);
check(await unreadPelit(), 'Esc in an edit box doesn’t mark the channel read');

await markUnread(bMsg._id);
await page.locator(`#message-${aMsg._id}`).locator('.content, .body, p').first().click({ button: 'right' });
await page.getByRole('menu').waitFor();
await press('Escape');
await page.waitForTimeout(3_000);
check(await unreadPelit(), 'Esc with a menu open closes the menu and doesn’t mark the channel read');

// Settings: the shell isn't mounted there. Opened from #yleinen, so the redirect after the settings frame's
// own Escape lands on #yleinen and not on #pelit.
await markUnread(bMsg._id);
await page.goto(`${APP}/channels/${st.serverId}/${ch.yleinen}`, { waitUntil: 'networkidle' });
await page.goto(`${APP}/settings/profile`, { waitUntil: 'networkidle' });
await press('Escape');
await page.waitForURL((u) => !u.pathname.includes('/settings/'), { timeout: 8_000 }).catch(() => {});
await page.waitForTimeout(3_000);
check(await unreadPelit(), 'Esc on the settings route doesn’t mark #pelit read');

// Typing starts a message (M4.8 task 2b). The composer's text, without its placeholder.
const composerText = () => page.evaluate(() => {
  const content = document.querySelector('.composer .cm-content');
  if (!content) return null;
  const copy = content.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('.cm-placeholder').forEach((n) => n.remove());
  return copy.textContent ?? '';
});
const textIs = (want: string) => until(async () => (await composerText()) === want, 4_000).then(() => true, () => false);
const composerEmptyAfterPause = async () => { await page.waitForTimeout(800); return (await composerText()) === ''; };
const clearComposer = async () => { await page.locator('.composer .cm-content').click(); await press('Control+A'); await press('Backspace'); await composerEmptyAfterPause(); };

await page.goto(`${APP}/channels/${st.serverId}/${ch.pelit}`, { waitUntil: 'networkidle' });
await page.locator('.composer .cm-content').waitFor();
await blur();
check(await page.evaluate(() => document.activeElement === document.body), 'nothing is focused before typing');
await page.keyboard.type('hei');
check(await textIs('hei'), 'typing with nothing focused lands in the composer, first character intact', JSON.stringify(await composerText()));
check(await page.evaluate(() => !!document.activeElement?.closest('.cm-editor')), 'the composer has focus after the first key');
await clearComposer();

// The header search (the `search` box above): typing there doesn't reach the composer.
await blur();
await search.click();
await page.keyboard.type('xyz');
check((await search.inputValue()) === 'xyz' && (await composerText()) === '', 'typing in the header search does not reach the composer', JSON.stringify([await search.inputValue(), await composerText()]));
await search.fill('');
await blur();

// Space on a focused button activates it, and types nothing: the pins button toggles the find panel.
const pins = page.getByRole('button', { name: 'Pinned messages', exact: true });
await pins.evaluate((b) => b.addEventListener('click', () => { b.dataset.clicks = String(Number(b.dataset.clicks ?? 0) + 1); }));
await pins.focus();
await press('Space');
const pinsClicked = await until(async () => (await pins.getAttribute('data-clicks')) === '1', 4_000).then(() => true, () => false);
check(pinsClicked && (await composerEmptyAfterPause()), 'Space on a focused button activates it and types nothing', JSON.stringify(await pins.getAttribute('data-clicks')));
await pins.click();
await blur();

// With a message menu open, typing reaches neither the composer nor the menu.
const menuMessage = page.locator(`#message-${aMsg._id}`);
await menuMessage.locator('.content, .body, p').first().click({ button: 'right' });
const menu = page.getByRole('menu');
await menu.waitFor();
await page.keyboard.type('hei');
check((await composerEmptyAfterPause()) && (await menu.isVisible()), 'with a menu open, typing reaches neither the composer nor the menu');
await press('Escape');
await page.waitForTimeout(500);

// With the emoji picker open, typing goes to the picker's search or nowhere, never the composer.
await blur();
await press('Control+E');
const emojiSearch = page.getByRole('searchbox', { name: 'Find the perfect emoji' });
await emojiSearch.waitFor();
await blur();
await page.keyboard.type('hei');
check(await composerEmptyAfterPause(), 'with the emoji picker open, typing does not reach the composer', JSON.stringify(await composerText()));
await press('Escape');
await emojiSearch.waitFor({ state: 'detached', timeout: 4_000 }).catch(() => {});

// With the shortcuts dialog open, typing reaches neither the composer nor the dialog's text.
await blur();
await press('Control+/');
await page.locator('dialog[open]').waitFor();
await page.keyboard.type('hei');
check(await composerEmptyAfterPause(), 'with a dialog open, typing does not reach the composer');
await press('Escape');
await page.locator('dialog[open]').waitFor({ state: 'detached', timeout: 4_000 }).catch(() => {});

// A channel the persona can't send in: the composer shows its notice, and typing does nothing.
await page.goto(`${APP}/channels/${fresh.id}/${noSend}`, { waitUntil: 'networkidle' });
await page.locator('.composer.blocked').waitFor();
await blur();
await page.keyboard.type('hei');
await page.waitForTimeout(800);
check((await page.locator('.composer .cm-content').count()) === 0 && new URL(page.url()).pathname.endsWith(`/${noSend}`), 'in a channel the persona can’t send in, typing does nothing');

// Paste with nothing focused: the clipboard's text lands in the composer, as a real Ctrl+V.
await page.goto(`${APP}/channels/${st.serverId}/${ch.pelit}`, { waitUntil: 'networkidle' });
await page.locator('.composer .cm-content').waitFor();
await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(APP).origin });
await page.evaluate(() => navigator.clipboard.writeText('liitetty teksti'));
await blur();
await press('Control+V');
check(await textIs('liitetty teksti'), 'Ctrl+V with nothing focused pastes into the composer', JSON.stringify(await composerText()));
await clearComposer();

check(problems.console.length === 0, 'no console errors', problems.console.slice(0, 3).join(' | '));
await browser.close();
await sweep(admin, [dev]);
console.log(failed ? `shortcuts: ${failed} failed` : 'shortcuts: all passed');
process.exit(failed ? 1 : 0);
