/**
 * Composer spike check (m2a-plan.md task 1): `node tools/live/src/composer.ts [out.png] [desktop|phone]`.
 * Signs in as dev, opens #yleinen, and checks the sample draft's tokens, caret steps, Backspace over a
 * token, typing, undo, and what Enter would send.
 */
import { loadState } from '../../seed/src/config.ts';
import { APP, launch, watch } from './browser.ts';
import { signIn } from './login.ts';

const [out = 'composer.png', mode = 'desktop'] = process.argv.slice(2);
const phone = mode === 'phone';
const state = loadState()!;
const browser = await launch();
const page = await browser.newPage(phone
  ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
  : { viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const problems = watch(page);
await signIn(page, 'dev');
await page.goto(`${APP}/channels/${state.serverId}/${state.channels.yleinen}`, { waitUntil: 'networkidle' });
const content = page.locator('.composer .cm-content');
await content.waitFor();

const text = () => content.evaluate((el) => (el as HTMLElement & { cmView?: unknown }).closest('.cm-editor') && (el.textContent ?? ''));
const results: Record<string, unknown> = {};
results.tokens = await page.locator('.composer .cm-token, .composer .cm-token-emoji').evaluateAll((els) => els.map((e) => e.className + ' ' + (e.textContent || (e as HTMLImageElement).alt)));
results.visible = await text();

// Type at the end, then undo it.
await content.click();
await page.keyboard.press('Control+End');
await page.keyboard.type(' Hyvää yötä!');
results.typed = await text();
await page.keyboard.press('Control+z');
results.afterUndo = await text();

// Readout from Enter, or from the send button on a phone, where Enter adds a line.
if (phone) {
  await page.keyboard.press('Enter');
  results.phoneEnterLines = await content.locator('.cm-line').count();
  await page.keyboard.press('Backspace');
  await page.getByRole('button', { name: 'Send message' }).click();
} else await page.keyboard.press('Enter');
results.readout = await page.locator('.readout pre').textContent();

// Home, then Right: does the caret step over the first token in one press? Backspace removes it whole.
await page.keyboard.press('Control+Home');
for (let i = 0; i < 'Moikka '.length; i++) await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowRight');
await page.keyboard.press('Backspace');
if (phone) await page.getByRole('button', { name: 'Send message' }).click();
else await page.keyboard.press('Enter');
results.afterTokenBackspace = await page.locator('.readout pre').textContent();
await page.screenshot({ path: out });
console.log(JSON.stringify({ ...results, ...problems }, null, 2));
await browser.close();
