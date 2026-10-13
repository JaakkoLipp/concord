/**
 * M2a task 8 on the live deployment: `node tools/live/src/find.ts [out.png]`.
 * `dev` searches #yleinen for "sauna", jumps to a result, opens the pins panel, and searches the group DM.
 */
import { loadState } from '../../seed/src/config.ts';
import { APP, launch, watch } from './browser.ts';
import { signIn } from './login.ts';

const st = loadState()!;
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
const problems = watch(page);
await signIn(page, 'dev');
await page.goto(`${APP}/channels/${st.serverId}/${st.channels.yleinen}`, { waitUntil: 'networkidle' });
const results: Record<string, unknown> = {};
const search = page.getByRole('searchbox', { name: 'Search' });
const panel = page.locator('.find');

await search.fill('sauna');
const t0 = Date.now();
await search.press('Enter');
await panel.locator('.result').first().waitFor();
results.searchMs = Date.now() - t0;
results.searchTitle = await panel.locator('h2').innerText();
results.firstResults = (await panel.locator('.result .content').allInnerTexts()).slice(0, 3).map((t) => t.slice(0, 60));
const target = panel.locator('.result').nth(4);
await target.hover();
await target.getByRole('button', { name: 'Jump' }).click();
await page.waitForURL(/\/channels\/[^/]+\/[^/]+\/[0-9A-Z]{26}$/);
const id = page.url().split('/').at(-1)!;
await page.locator(`#message-${id}`).waitFor();
results.jumpedHighlighted = await page.locator(`#message-${id}`).evaluate((el) => el.classList.contains('highlighted'));
results.jumpedVisible = await page.locator(`#message-${id}`).isVisible();

await page.getByRole('button', { name: 'Pinned messages' }).click();
await panel.locator('h2', { hasText: 'Pinned messages' }).waitFor();
await panel.locator('.result').first().waitFor();
results.pins = await panel.locator('.result').count();
await page.screenshot({ path: process.argv[2] ?? 'find.png' });
await page.getByRole('button', { name: 'Close' }).click();
results.memberListBack = await page.locator('aside, .side-panel').first().innerText().then((t) => t.slice(0, 30));

// The group DM: search, then jump through the new DM message route.
await page.goto(`${APP}/channels/@me/${st.groupId}`, { waitUntil: 'networkidle' });
const words = (await page.locator('article.message .content').allInnerTexts()).join(' ').split(/[^\p{L}]+/u).filter((w) => w.length >= 5);
results.groupWord = words.at(-1);
await search.fill(words.at(-1) ?? 'sauna');
await search.press('Enter');
await panel.locator('.result').first().or(panel.getByText('No messages match')).waitFor();
results.groupResults = await panel.locator('.result').count();
if (results.groupResults) {
  await panel.locator('.result').last().hover();
  await panel.locator('.result').last().getByRole('button', { name: 'Jump' }).click();
  await page.waitForURL(/\/channels\/@me\/[^/]+\/[0-9A-Z]{26}$/);
  const dmId = page.url().split('/').at(-1)!;
  await page.locator(`#message-${dmId}`).waitFor();
  results.groupJumpVisible = await page.locator(`#message-${dmId}`).isVisible();
}

console.log(JSON.stringify({ ...results, problems }, null, 2));
await browser.close();
