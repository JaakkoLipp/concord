/**
 * M2a task 5 on the live deployment: `node tools/live/src/autocomplete.ts [out.png]`.
 * `dev` mentions `aino` through `@` autocomplete, links a channel with `#`, adds a custom emoji with `:`,
 * and sends. `aino`, in another channel, gets a mention badge. `lauri` sees no roles to mention.
 */
import type { Page } from 'playwright-core';
import { loadState } from '../../seed/src/config.ts';
import { APP, launch, watch } from './browser.ts';
import { signIn } from './login.ts';

const st = loadState()!;
const browser = await launch();
const open = async (handle: string, key: string) => {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  const problems = watch(page);
  await signIn(page, handle);
  await page.goto(`${APP}/channels/${st.serverId}/${st.channels[key]}`, { waitUntil: 'networkidle' });
  await page.locator('.composer .cm-content').waitFor();
  return { page, problems };
};
const options = (page: Page) => page.getByRole('listbox', { name: 'Suggestions' }).getByRole('option').allInnerTexts();
const results: Record<string, unknown> = {};

const dev = await open('dev', 'botti');
const aino = await open('aino', 'pelit');
const lauri = await open('lauri', 'botti');
const bottiLabel = () => aino.page.locator('.channel', { hasText: 'botti' }).first().getAttribute('aria-label');
results.ainoBottiBefore = await bottiLabel();

await dev.page.bringToFront();
const editor = dev.page.locator('.composer .cm-content');
await editor.click();
const tag = Date.now().toString(36);
await dev.page.keyboard.type(`autotesti ${tag} @ai`);
await dev.page.getByRole('listbox', { name: 'Suggestions' }).waitFor();
results.atOptions = await options(dev.page);
await dev.page.keyboard.press('Enter');
await dev.page.keyboard.type('katso #yle');
results.hashOptions = await options(dev.page);
await dev.page.keyboard.press('Tab');
await dev.page.keyboard.type('ja :sau');
await dev.page.getByRole('listbox', { name: 'Suggestions' }).waitFor();
results.colonOptions = (await options(dev.page)).slice(0, 3);
await dev.page.keyboard.press('Enter');
await dev.page.keyboard.type('@Mod');
results.devRoleOptions = await options(dev.page).catch(() => []);
await dev.page.keyboard.press('Escape');
results.listAfterEscape = await dev.page.getByRole('listbox', { name: 'Suggestions' }).count();
for (let i = 0; i < 4; i++) await dev.page.keyboard.press('Backspace');
results.composerTokens = await dev.page.locator('.composer .cm-token, .composer .cm-token-emoji').evaluateAll((els) => els.map((e) => e.textContent || (e as HTMLImageElement).alt));
await dev.page.screenshot({ path: process.argv[2] ?? 'autocomplete.png' });
await dev.page.keyboard.press('Enter');

const t0 = Date.now();
await aino.page.locator('.channel', { hasText: 'botti' }).first().and(aino.page.locator('[aria-label*="mention"]')).waitFor({ timeout: 10_000 }).catch(() => {});
results.mentionBadgeMs = Date.now() - t0;
results.ainoBottiAfter = await bottiLabel();
await lauri.page.getByText(`autotesti ${tag}`).waitFor();
results.sentPills = await lauri.page.locator('article.message', { hasText: `autotesti ${tag}` }).last().locator('.mention, .emoji').evaluateAll((els) => els.map((e) => e.textContent || (e as HTMLImageElement).alt));

await lauri.page.locator('.composer .cm-content').click();
await lauri.page.keyboard.type('@Mod');
await lauri.page.waitForTimeout(300);
results.memberRoleOptions = await options(lauri.page).catch(() => []);

console.log(JSON.stringify({ ...results, problems: { dev: dev.problems, aino: aino.problems, lauri: lauri.problems } }, null, 2));
await browser.close();
