/**
 * m4.5-plan.md task 2 on the local stack: a message's context menu, opened by mouse and by keyboard, and each item
 * doing what it says. In #botti, `aino` posts a plain message, one with a link and one with an image, and `dev`
 * one of their own; `dev` works through the menus in the browser, and the API confirms each result.
 * `node tools/live/src/menus.ts [screenshot-dir]`
 */
import { join } from 'node:path';
import type { Page } from 'playwright-core';
import { loadState } from '../../seed/src/config.ts';
import { APP, launch, watch } from './browser.ts';
import { signIn } from './login.ts';
import { person, until } from './people.ts';

const st = loadState()!;
const out = process.argv[2];
const channel = st.channels.botti!;
let failed = 0;
function check(ok: boolean, what: string, detail = ''): void {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ` -> ${detail}` : ''}`);
}

const [aino, dev] = await Promise.all(['aino', 'dev'].map(person));
const tag = Date.now().toString(36);
type Sent = { _id: string };
const post = (who: typeof aino, content: string) => who!.call<Sent>('POST', `/channels/${channel}/messages`, { content });
const plain = await post(aino, `valikkotesti ${tag}`);
const LINK = `https://example.com/concord-${tag}`;
const linked = await post(aino, `linkki ${tag} ${LINK}`);
const IMAGE = 'https://media.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif';
const image = await post(aino, IMAGE);
const own = await post(dev, `oma ${tag}`);

const browser = await launch();
const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(APP).origin });
const page = await context.newPage();
const problems = watch(page);
await signIn(page, 'dev');
await page.goto(`${APP}/channels/${st.serverId}/${channel}`, { waitUntil: 'networkidle' });
await page.locator('.composer .cm-content').waitFor();
await page.locator(`#message-${image._id} img[data-original]`).waitFor({ timeout: 20_000 });

const message = (id: string) => page.locator(`#message-${id}`);
const menu = page.getByRole('menu');
async function openMenu(id: string, on?: string): Promise<string[]> {
  await page.keyboard.press('Escape');
  const target = on ? message(id).locator(on).first() : message(id).locator('.content, .body, p').first();
  await target.click({ button: 'right' });
  await menu.waitFor();
  return menu.getByRole('menuitem').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? e.textContent?.trim() ?? ''));
}
async function pick(id: string, item: string, on?: string): Promise<void> {
  await openMenu(id, on);
  await menu.getByRole('menuitem', { name: item, exact: true }).click();
}
const shows = (l: ReturnType<Page['locator']>) => l.waitFor({ timeout: 5_000 }).then(() => true, () => false);
const clipboard = () => page.evaluate(() => navigator.clipboard.readText());

// What each menu offers.
const theirs = await openMenu(plain._id);
check(theirs.includes('Copy text') && theirs.includes('Mark unread') && !theirs.includes('Edit') && theirs.includes('Reply'),
  'aino’s message offers Reply, Mark unread and Copy text, not Edit', theirs.join(' | '));
if (out) await page.screenshot({ path: join(out, 'message-menu.png') });
const mine = await openMenu(own._id);
check(mine.includes('Edit') && mine.includes('Delete message'), 'dev’s own message offers Edit and Delete', mine.join(' | '));

// Quick reaction: the first chip reacts.
await openMenu(plain._id);
const chip = menu.locator('.chip').first();
const chipLabel = (await chip.getAttribute('aria-label')) ?? '';
await chip.click();
const reacted = await until(async () => Object.keys((await aino!.call<{ reactions?: Record<string, string[]> }>('GET', `/channels/${channel}/messages/${plain._id}`)).reactions ?? {}).length > 0, 8_000).then(() => true, () => false);
check(reacted, `a quick reaction reacts (${chipLabel})`);

await pick(plain._id, 'Copy text');
check((await clipboard()) === `valikkotesti ${tag}`, 'Copy text', await clipboard());
await pick(plain._id, 'Copy message ID');
check((await clipboard()) === plain._id, 'Copy message ID');
await pick(plain._id, 'Copy message link');
check((await clipboard()).endsWith(`/${channel}/${plain._id}`), 'Copy message link', await clipboard());

await pick(plain._id, 'Reply');
check(await shows(page.getByText(/^Replying to/)), 'Reply opens the reply bar');
await page.keyboard.press('Escape');

await pick(own._id, 'Edit');
check(await shows(message(own._id).locator('.cm-editor')), 'Edit opens the edit box');
await message(own._id).locator('.cm-content').press('Escape');
await message(own._id).locator('.cm-editor').waitFor({ state: 'detached' });

await pick(plain._id, 'Add reaction');
check(await shows(page.getByRole('searchbox', { name: 'Find the perfect emoji' })), 'Add reaction opens the picker');
await page.keyboard.press('Escape');

// The link's own items.
const linkItems = await openMenu(linked._id, `a[href="${LINK}"]`);
check(linkItems.includes('Open link') && linkItems.includes('Copy link'), 'a link adds Open link and Copy link', linkItems.join(' | '));
await menu.getByRole('menuitem', { name: 'Copy link', exact: true }).click();
check((await clipboard()) === LINK, 'Copy link copies the link');
const popup = context.waitForEvent('page', { timeout: 5_000 });
await pick(linked._id, 'Open link', `a[href="${LINK}"]`);
const opened = await popup.then((p) => p.url(), () => '');
check(opened.startsWith(LINK), 'Open link opens it in a new tab', opened);
await context.pages().filter((p) => p !== page).reduce((a, p) => a.then(() => p.close()), Promise.resolve());

// The image's own items.
const imageItems = await openMenu(image._id, 'img[data-original]');
check(imageItems.includes('Copy image') && imageItems.includes('Save image') && imageItems.includes('Open original'), 'an image adds Copy, Save and Open original', imageItems.join(' | '));
await menu.getByRole('menuitem', { name: 'Copy image', exact: true }).click();
const types = await until(async () => (await page.evaluate(async () => (await navigator.clipboard.read()).flatMap((i) => i.types))).includes('image/png'), 8_000).then(() => true, () => false);
check(types, 'Copy image puts a PNG on the clipboard');
const download = page.waitForEvent('download', { timeout: 8_000 });
await pick(image._id, 'Save image', 'img[data-original]');
const saved = await download.then((d) => d.suggestedFilename(), () => '');
check(saved === 'giphy.gif', 'Save image downloads it', saved);
const popup2 = context.waitForEvent('page', { timeout: 5_000 });
await pick(image._id, 'Open original', 'img[data-original]');
const original = await popup2.then((p) => p.url(), () => '');
check(original.includes('giphy'), 'Open original opens the image’s own address', original);
await context.pages().filter((p) => p !== page).reduce((a, p) => a.then(() => p.close()), Promise.resolve());

// Keyboard: Shift+F10 and the context-menu key open the same menu at the focused message.
await message(plain._id).focus();
await page.keyboard.press('Shift+F10');
const byShiftF10 = await menu.waitFor({ timeout: 3_000 }).then(() => true, () => false);
const box = await message(plain._id).boundingBox();
const at = await menu.boundingBox();
check(byShiftF10 && !!box && !!at && Math.abs(at.x - box.x) < 40, 'Shift+F10 opens the menu at the focused message');
await page.keyboard.press('Escape');
await message(plain._id).focus();
await page.keyboard.press('ContextMenu');
check(await menu.waitFor({ timeout: 3_000 }).then(() => true, () => false), 'the context-menu key opens it');
await page.keyboard.press('Escape');
await message(plain._id).focus();
await page.keyboard.press('ArrowDown');
const next = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.id);
check(next === linked._id, 'Down moves to the next message');

// Mark unread from the link message: the read point moves before it, and the channel stays unread while open.
await pick(linked._id, 'Mark unread');
const unread = async () => (await dev!.call<{ _id: { channel: string }; last_id?: string }[]>('GET', '/sync/unreads')).find((u) => u._id.channel === channel)?.last_id;
const movedBack = await until(async () => (await unread()) === plain._id, 8_000).then(() => true, () => false);
check(movedBack, 'Mark unread acknowledges the message before it', await unread());
check(await shows(page.locator('.divider.new')), 'the "new messages" line shows');
await page.waitForTimeout(3_000);
check((await unread()) === plain._id, 'the open channel doesn’t read itself again');
if (out) await page.screenshot({ path: join(out, 'marked-unread.png') });

// Delete, through its dialog.
await pick(own._id, 'Delete message');
await page.getByRole('dialog').getByRole('button', { name: 'Delete message' }).click();
const gone = await until(async () => (await dev!.call('GET', `/channels/${channel}/messages/${own._id}`).then(() => false, () => true)), 8_000).then(() => true, () => false);
check(gone, 'Delete deletes it');

check(problems.console.length === 0, 'no console errors', problems.console.slice(0, 3).join(' | '));
await browser.close();
console.log(failed ? `menus: ${failed} failed` : 'menus: all passed');
process.exit(failed ? 1 : 0);
