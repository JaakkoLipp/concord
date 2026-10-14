/**
 * M2b's acceptance check (m2b-plan.md task 8), criterion 1: friend requests, DMs and groups end to end
 * between `tuuli` and `onni` in two browsers, three runs, every step timed until the other browser shows
 * it. After the first run, both reload and check the state survived. Criteria 2 and 3 are `idle.ts` and
 * `profile.ts`. Everything is undone at the end. `node tools/live/src/m2b.ts [runs]`
 */
import type { Page } from 'playwright-core';
import { APP, launch, watch, type PageProblems } from './browser.ts';
import { signIn } from './login.ts';
import { person, unrelate, until } from './people.ts';

const runs = Number(process.argv[2] ?? 3);
/** Unique per invocation, so messages from earlier runs never match. */
const tag = Date.now().toString(36).slice(-5);
const [tuuli, onni, aino] = await Promise.all(['tuuli', 'onni', 'aino'].map(person));
const times: Record<string, number[]> = {};
const after: Record<string, unknown> = {};
const problems: Record<string, PageProblems> = {};

const browser = await launch();
async function open(handle: string) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  problems[handle] = watch(page);
  await signIn(page, handle);
  await page.goto(`${APP}/channels/@me`, { waitUntil: 'networkidle' });
  await page.getByText('Connected').waitFor({ timeout: 15_000 }).catch(() => {});
  return page;
}
async function timed(name: string, action: () => Promise<unknown>, check: () => Promise<boolean>) {
  console.error(`step: ${name}`);
  const start = performance.now();
  await action();
  await until(check, 15_000);
  (times[name] ??= []).push(Math.round(performance.now() - start));
}
const row = (page: Page, id: string) => page.locator(`li.row[data-user="${id}"]`);
const dmRow = (page: Page, text: string) => page.locator('nav[aria-label="Direct messages"] .row-wrap', { hasText: text });
const message = (page: Page, text: string) => page.locator('.scroller').getByText(text, { exact: true });
async function send(page: Page, text: string) {
  await page.locator('.composer .cm-content').click();
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}
async function cleanUp() {
  const dms = await tuuli!.call<{ _id: string; channel_type: string; name?: string }[]>('GET', '/users/dms');
  for (const g of dms.filter((c) => c.channel_type === 'Group' && c.name === 'Hyväksyntä')) {
    for (const p of [tuuli!, onni!, aino!]) await p.call('DELETE', `/channels/${g._id}?leave_silently=true`).catch(() => {});
  }
  await unrelate(tuuli!, onni!);
  await unrelate(tuuli!, aino!);
}
await cleanUp();

const t = await open('tuuli');
const o = await open('onni');

process.on('uncaughtException', async (e) => {
  await t.screenshot({ path: 'm2b-fail-tuuli.png' }).catch(() => {});
  await o.screenshot({ path: 'm2b-fail-onni.png' }).catch(() => {});
  console.error(e);
  process.exit(1);
});
for (let run = 1; run <= runs; run++) {
  console.error(`run ${run}`);
  await cleanUp();
  await tuuli!.call('POST', '/users/friend', { username: aino!.tag });
  await aino!.call('PUT', `/users/${tuuli!.id}/friend`);
  await t.goto(`${APP}/channels/@me`, { waitUntil: 'networkidle' });
  await o.goto(`${APP}/channels/@me`, { waitUntil: 'networkidle' });
  await o.getByRole('tab', { name: /^Pending/ }).click();

  // Friend request and accept.
  await t.getByRole('button', { name: 'Add friend' }).click();
  await t.getByLabel('Username and number').fill(onni!.tag);
  await timed('request', () => t.getByRole('button', { name: 'Send friend request' }).click(), () => row(o, tuuli!.id).isVisible());
  await t.getByRole('tab', { name: /^All/ }).click();
  await timed('accept', () => row(o, tuuli!.id).getByRole('button', { name: 'Accept' }).click(), () => row(t, onni!.id).isVisible());

  // DM: opened by tuuli, then messages both ways.
  await timed('dm opens', () => row(t, onni!.id).getByRole('button', { name: 'Message' }).click(), () => dmRow(o, 'tuuli').isVisible());
  await t.locator('.composer .cm-content').waitFor();
  await dmRow(o, 'tuuli').locator('a').click();
  await o.locator('.composer .cm-content').waitFor();
  await timed('dm message', () => send(t, `Moi onni ${tag}-${run}`), () => message(o, `Moi onni ${tag}-${run}`).isVisible());
  await timed('dm reply', () => send(o, `Moi tuuli ${tag}-${run}`), () => message(t, `Moi tuuli ${tag}-${run}`).isVisible());

  // Group with onni and aino, then a message in it.
  await t.getByRole('button', { name: 'Start a DM or group' }).click();
  const picker = t.getByRole('dialog');
  for (const name of ['onni', 'Aino Virtanen']) await picker.locator('label', { hasText: name }).getByRole('checkbox').check();
  await picker.getByLabel('Group name').fill('Hyväksyntä');
  await timed('group created', () => picker.getByRole('button', { name: 'Create group' }).click(), () => dmRow(o, 'Hyväksyntä').isVisible());
  await t.waitForURL(/\/channels\/@me\/[0-9A-Z]{26}$/);
  await t.locator('.composer .cm-content').waitFor();
  await dmRow(o, 'Hyväksyntä').locator('a').click();
  await o.locator('.composer .cm-content').waitFor();
  await timed('group message', () => send(t, `Ryhmälle ${tag}-${run}`), () => message(o, `Ryhmälle ${tag}-${run}`).isVisible());

  if (run === 1) {
    // After a reload, everything is where it was.
    await o.reload({ waitUntil: 'networkidle' });
    await o.getByText('Connected').waitFor({ timeout: 15_000 }).catch(() => {});
    after.groupHistoryAfterReload = await message(o, `Ryhmälle ${tag}-1`).isVisible().catch(() => false)
      || await until(() => message(o, `Ryhmälle ${tag}-1`).isVisible()).then(() => true, () => false);
    after.dmAndGroupListedAfterReload = await dmRow(o, 'tuuli').isVisible() && await dmRow(o, 'Hyväksyntä').isVisible();
    await o.goto(`${APP}/channels/@me`, { waitUntil: 'networkidle' });
    await o.getByRole('tab', { name: /^All/ }).click();
    after.friendAfterReload = await until(() => row(o, tuuli!.id).isVisible()).then(() => true, () => false);
  }
}

await cleanUp();
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
console.log(JSON.stringify({
  runs,
  times: Object.fromEntries(Object.entries(times).map(([k, v]) => [k, { median: median(v), worst: Math.max(...v), all: v }])),
  after,
  problems,
}, null, 2));
await browser.close();
