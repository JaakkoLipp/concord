/**
 * M2a task 4 on the live deployment: `node tools/live/src/reactions.ts [picker.png]`.
 * In #botti: `aino` reacts through the picker with a Unicode and a custom emoji, `dev` toggles a chip,
 * `lauri` sees the result live, Ctrl+E inserts into the composer, and a
 * favourite set on one device shows on another.
 */
import type { Page } from 'playwright-core';
import { loadState } from '../../seed/src/config.ts';
import { APP, launch, watch } from './browser.ts';
import { signIn } from './login.ts';

const st = loadState()!;
const browser = await launch();
const open = async (handle: string) => {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  const problems = watch(page);
  await signIn(page, handle);
  await page.goto(`${APP}/channels/${st.serverId}/${st.channels.botti}`, { waitUntil: 'networkidle' });
  await page.locator('.composer .cm-content').waitFor();
  return { page, problems };
};
const row = (page: Page, text: string) => page.locator('article.message', { hasText: text }).last();
const timed = async (f: () => Promise<unknown>) => { const t = Date.now(); await f(); return Date.now() - t; };
const results: Record<string, unknown> = {};

const dev = await open('dev');
const aino = await open('aino');
const lauri = await open('lauri');
const tag = Date.now().toString(36);
const text = `reaktiotesti ${tag}`;
await dev.page.locator('.composer .cm-content').click();
await dev.page.keyboard.type(text);
await dev.page.keyboard.press('Enter');
await aino.page.getByText(text).waitFor();

// aino: React button, search, Enter picks the first result.
await aino.page.bringToFront();
const react = async (page: Page, query: string) => {
  await row(page, text).hover();
  await row(page, text).getByRole('button', { name: 'Add reaction' }).first().click();
  const search = page.getByRole('searchbox', { name: 'Find the perfect emoji' });
  await search.waitFor();
  await search.fill(query);
  await page.locator('.grid button').first().waitFor();
  await search.press('Enter');
};
await react(aino.page, 'thumbsup');
results.unicodeReactionMs = await timed(() => row(dev.page, text).getByRole('button', { name: /👍, 1 reaction/ }).waitFor());
await react(aino.page, 'sauna');
results.customReactionMs = await timed(() => row(dev.page, text).getByRole('button', { name: /:sauna:, 1 reaction/ }).waitFor());

// dev toggles the 👍 chip on and off.
await dev.page.bringToFront();
await row(dev.page, text).getByRole('button', { name: /👍, 1 reaction/ }).click();
results.toggleOnMs = await timed(() => row(aino.page, text).getByRole('button', { name: /👍, 2 reactions/ }).waitFor());
await row(dev.page, text).getByRole('button', { name: /👍, 2 reactions/ }).click();
results.toggleOffMs = await timed(() => row(aino.page, text).getByRole('button', { name: /👍, 1 reaction/ }).waitFor());

// A third member sees the reactions live too.
results.thirdMemberChips = await row(lauri.page, text).locator('.chip').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));

// Ctrl+E in the composer, pick a smiley, send.
await dev.page.locator('.composer .cm-content').click();
await dev.page.keyboard.type(`emoji ${tag} `);
await dev.page.keyboard.press('Control+e');
await dev.page.getByRole('searchbox', { name: 'Find the perfect emoji' }).fill('grinning');
await dev.page.locator('.grid button').first().waitFor();
await dev.page.getByRole('searchbox', { name: 'Find the perfect emoji' }).press('Enter');
await dev.page.keyboard.press('Enter');
await aino.page.getByText(`emoji ${tag}`).waitFor();
results.sentEmoji = await row(aino.page, `emoji ${tag}`).locator('.content img').getAttribute('alt');

// Favourite on dev, then seen from a second dev session.
await dev.page.locator('.composer .cm-content').click();
await dev.page.keyboard.press('Control+e');
await dev.page.getByRole('dialog', { name: 'Emoji picker' }).waitFor();
await dev.page.getByRole('searchbox', { name: 'Find the perfect emoji' }).fill('sauna');
await dev.page.locator('.grid button', { has: dev.page.locator('img') }).first().waitFor();
await dev.page.locator('.picker').getByRole('button', { name: ':sauna:', exact: true }).first().click({ button: 'right' });
await dev.page.getByRole('searchbox', { name: 'Find the perfect emoji' }).fill('');
results.favouriteSectionLocal = await dev.page.getByRole('heading', { name: 'Favourites' }).count();
await dev.page.screenshot({ path: process.argv[2] ?? 'picker.png' });
await dev.page.keyboard.press('Escape');
await dev.page.waitForTimeout(3000);
const dev2 = await open('dev');
await dev2.page.locator('.composer .cm-content').click();
await dev2.page.keyboard.press('Control+e');
await dev2.page.getByRole('heading', { name: 'Favourites' }).waitFor({ timeout: 5000 }).catch(() => {});
results.favouriteOnSecondDevice = await dev2.page.locator('section', { has: dev2.page.getByRole('heading', { name: 'Favourites' }) }).getByRole('button', { name: ':sauna:', exact: true }).count();
// Undo the favourite so the check can run again.
await dev2.page.locator('section', { has: dev2.page.getByRole('heading', { name: 'Favourites' }) }).getByRole('button', { name: ':sauna:', exact: true }).click({ button: 'right' }).catch(() => {});
await dev2.page.waitForTimeout(3000);

console.log(JSON.stringify({ ...results, problems: { dev: dev.problems, aino: aino.problems, lauri: lauri.problems, dev2: dev2.problems } }, null, 2));
await browser.close();
