/**
 * M2a task 3 on the live deployment: `node tools/live/src/actions.ts [out.png]`.
 * In #botti, `dev` edits with Up arrow, replies to `aino`, deletes through the dialog and with Shift+click,
 * while `aino` watches. A moderator (`aino`) can pin, and a plain member (`lauri`) sees no pin action.
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
const send = async (page: Page, text: string) => {
  await page.locator('.composer .cm-content').click();
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
};
const row = (page: Page, text: string) => page.locator('article.message', { hasText: text }).last();
const timed = async (f: () => Promise<unknown>) => { const t = Date.now(); await f(); return Date.now() - t; };
const results: Record<string, unknown> = {};

const dev = await open('dev');
const aino = await open('aino');
const lauri = await open('lauri');
await dev.page.bringToFront();
const tag = Date.now().toString(36);

// Edit with Up arrow.
await send(dev.page, `muokattava ${tag}`);
await aino.page.getByText(`muokattava ${tag}`).waitFor();
await dev.page.locator('.composer .cm-content').click();
await dev.page.keyboard.press('ArrowUp');
await dev.page.locator('.edit .cm-content').waitFor();
await dev.page.keyboard.press('Control+End');
await dev.page.keyboard.type(' (muokattu)');
await dev.page.keyboard.press('Enter');
results.editMs = await timed(() => aino.page.getByText(`muokattava ${tag} (muokattu)`).waitFor());
results.editedMarker = await row(aino.page, `muokattava ${tag}`).locator('.edited').count();

// Reply to aino's message, with the mention on.
await send(aino.page, `vastattava ${tag}`);
await dev.page.getByText(`vastattava ${tag}`).waitFor();
await row(dev.page, `vastattava ${tag}`).hover();
await row(dev.page, `vastattava ${tag}`).getByRole('button', { name: 'Reply' }).click();
results.replyBar = await dev.page.locator('.reply-bar').innerText();
await dev.page.keyboard.type(`vastaus ${tag}`);
await dev.page.keyboard.press('Enter');
await aino.page.getByText(`vastaus ${tag}`).waitFor();
results.replyPreview = await row(aino.page, `vastaus ${tag}`).locator('.reply').innerText();
results.replyMentionedAino = await row(aino.page, `vastaus ${tag}`).evaluate((el) => el.classList.contains('mentioned'));

// Delete through the dialog.
const del = async (page: Page, text: string, shift: boolean) => {
  await row(page, text).hover();
  await row(page, text).getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'Delete message' }).click({ modifiers: shift ? ['Shift'] : [] });
};
await del(dev.page, `vastaus ${tag}`, false);
results.dialogShown = await dev.page.getByRole('dialog', { name: 'Delete message' }).isVisible();
await dev.page.getByRole('dialog').getByRole('button', { name: 'Delete message' }).click();
results.deleteMs = await timed(() => aino.page.getByText(`vastaus ${tag}`).waitFor({ state: 'detached' }));

// Shift+click deletes at once.
await del(dev.page, `muokattava ${tag}`, true);
results.shiftDeleteNoDialog = !(await dev.page.getByRole('dialog', { name: 'Delete message' }).isVisible());
results.shiftDeleteMs = await timed(() => aino.page.getByText(`muokattava ${tag}`).waitFor({ state: 'detached' }));

// Pin: the moderator has it, the plain member doesn't.
await row(lauri.page, `vastattava ${tag}`).hover();
await row(lauri.page, `vastattava ${tag}`).getByRole('button', { name: 'More' }).click();
results.memberSeesPin = await lauri.page.getByRole('menuitem', { name: 'Pin message' }).count();
await lauri.page.keyboard.press('Escape');
await aino.page.bringToFront();
await row(aino.page, `vastattava ${tag}`).hover();
await row(aino.page, `vastattava ${tag}`).getByRole('button', { name: 'More' }).click();
await aino.page.getByRole('menuitem', { name: 'Pin message' }).click();
results.pinSystemMessageMs = await timed(() => dev.page.locator('.system', { hasText: 'pinned a message' }).last().waitFor());
await row(aino.page, `vastattava ${tag}`).hover();
await row(aino.page, `vastattava ${tag}`).getByRole('button', { name: 'More' }).click();
await aino.page.getByRole('menuitem', { name: 'Unpin message' }).click();
await aino.page.waitForTimeout(1000);

await dev.page.screenshot({ path: process.argv[2] ?? 'actions.png' });
console.log(JSON.stringify({ ...results, problems: { dev: dev.problems, aino: aino.problems, lauri: lauri.problems } }, null, 2));
await browser.close();
