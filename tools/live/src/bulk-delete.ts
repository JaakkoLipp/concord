/**
 * m4.7-plan.md task 7 on the local dev stack, on a throwaway server (probe-moderation.ts's `setup`): `dev-admin`, the owner,
 * ticks 3 of tuuli's messages and deletes them together, and `dev` sees them go. `onni`, a Moderator with Manage messages
 * but not Manage server, and `dev` aren't offered "Select messages". Usage: node tools/live/src/bulk-delete.ts
 */
import type { Browser, Page } from 'playwright-core';
import { chromium } from 'playwright-core';
import { assertDevStack } from '../../seed/src/vps.ts';
import { APP } from './browser.ts';
import { signIn } from './login.ts';
import { until } from './people.ts';
import { cleanup, setup } from './probe-moderation.ts';

await assertDevStack();
const failures: string[] = [];
const check = (ok: boolean, what: string, actual?: unknown) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${actual === undefined ? '' : ` -> ${JSON.stringify(actual)}`}`);
  if (!ok) failures.push(what);
};
const passes = (p: Promise<unknown>) => p.then(() => true, () => false);

const p = await setup();
const browser: Browser = await chromium.launch({ headless: true });
const article = (page: Page, text: string) => page.locator('article.message', { hasText: text });
async function open(handle: string): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 1450, height: 920 } })).newPage();
  await signIn(page, handle);
  await page.goto(`${APP}/channels/${p.server}/${p.text}`, { waitUntil: 'networkidle' });
  await article(page, 'bulk 5').waitFor({ timeout: 15_000 });
  // The messages are unread, so the list opens at the first of them with "Jump to present" over the last ones.
  const present = page.getByRole('button', { name: /Jump to present/i });
  if (await present.isVisible()) await present.click();
  return page;
}
async function offered(page: Page, text: string): Promise<boolean> {
  await article(page, text).click({ button: 'right' });
  const menu = page.getByRole('menu').first();
  await menu.waitFor({ timeout: 4_000 });
  const has = await menu.getByRole('menuitem', { name: 'Select messages' }).count() > 0;
  await page.keyboard.press('Escape');
  return has;
}

try {
  for (let i = 1; i <= 5; i++) await p.target.call('POST', `/channels/${p.text}/messages`, { content: `bulk ${i}` });
  const owner = await open('dev-admin');
  const dev = await open('dev');
  const mod = await open('onni');

  check(!(await offered(dev, 'bulk 1')), 'a plain member isn’t offered Select messages');
  check(!(await offered(mod, 'bulk 1')), 'nor a Moderator with Manage messages but not Manage server');

  await article(owner, 'bulk 1').click({ button: 'right' });
  await owner.getByRole('menu').first().getByRole('menuitem', { name: 'Select messages' }).click();
  const bar = owner.getByRole('toolbar', { name: 'Select messages' });
  check(await passes(bar.getByText('1 message selected').waitFor({ timeout: 3_000 })), 'Select messages starts with the message ticked');
  await article(owner, 'bulk 2').click();
  await article(owner, 'bulk 3').getByRole('checkbox').click();
  check(await passes(bar.getByText('3 messages selected').waitFor({ timeout: 3_000 })), 'clicking a message or its box ticks it');
  await article(owner, 'bulk 4').click();
  await article(owner, 'bulk 4').click();
  check(await passes(bar.getByText('3 messages selected').waitFor({ timeout: 3_000 })), 'clicking again unticks it');

  await bar.getByRole('button', { name: 'Delete 3 messages' }).click();
  const dialog = owner.getByRole('dialog');
  check(await passes(dialog.getByText('Delete 3 messages?').waitFor({ timeout: 3_000 })), 'one confirmation names the count');
  await dialog.getByRole('button', { name: 'Delete 3 messages' }).click();
  const gone = await passes(until(async () => !(await article(dev, 'bulk 1').count()) && !(await article(dev, 'bulk 2').count()) && !(await article(dev, 'bulk 3').count()), 8_000));
  check(gone && await article(dev, 'bulk 4').count() === 1 && await article(dev, 'bulk 5').count() === 1, 'another member sees the 3 go, and only them');
  const left = (await p.owner.call<{ content?: string }[]>('GET', `/channels/${p.text}/messages?limit=20`)).map((x) => x.content).filter((c) => c?.startsWith('bulk'));
  check(JSON.stringify(left.sort()) === JSON.stringify(['bulk 4', 'bulk 5']), 'Stoat holds only the other two', left);
  check(!(await bar.count()), 'selecting ends after the deletion');
  const log = await p.owner.call<{ audit_logs: { action?: Record<string, { count?: number }> }[] }>('GET', `/servers/${p.server}/audit_logs?type=MessageBulkDelete`);
  check(log.audit_logs.length === 1, 'the audit log records one bulk deletion', log.audit_logs[0]?.action);
} finally {
  await browser.close();
  await cleanup(p);
}
if (failures.length) {
  console.error(`\n${failures.length} failed`);
  process.exit(1);
}
console.log('\nall passed');
