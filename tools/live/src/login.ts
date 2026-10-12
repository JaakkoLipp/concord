/**
 * Sign a seeded persona in through the live client's login page, with TOTP when the persona has it.
 * `node tools/live/src/login.ts [handle] [screenshot.png]`. Used by the other live checks too.
 */
import type { Page } from 'playwright-core';
import { loadState } from '../../seed/src/config.ts';
import { passwordFor } from '../../seed/src/seed.ts';
import { totp } from '../../seed/src/totp.ts';
import { APP, launch, watch } from './browser.ts';

export async function signIn(page: Page, handle: string): Promise<void> {
  const state = loadState();
  const p = state?.personas[handle];
  if (!p) throw new Error(`unknown persona ${handle}`);
  await page.goto(APP, { waitUntil: 'networkidle' });
  await page.waitForURL(/\/app\/login/);
  await page.getByLabel('Email').fill(p.email);
  await page.getByLabel('Password').fill(passwordFor(handle));
  await page.getByRole('button', { name: 'Log in' }).click();
  if (p.totpSecret) {
    await page.getByLabel('Authentication code').waitFor();
    // Stoat accepts only the current 30-second window: answer mid-window.
    const into = Date.now() % 30_000;
    if (into < 8_000 || into > 20_000) await page.waitForTimeout((38_000 - into) % 30_000);
    await page.getByLabel('Authentication code').fill(totp(p.totpSecret));
    await page.getByRole('button', { name: 'Verify' }).click();
  }
  await page.waitForURL((u) => !u.pathname.startsWith('/app/login'));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const handle = process.argv[2] ?? 'totp';
  const out = process.argv[3];
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const problems = watch(page);
  await signIn(page, handle);
  await page.getByText('Connected').waitFor({ timeout: 15_000 });
  if (out) await page.screenshot({ path: out });
  console.log(JSON.stringify({ url: page.url(), text: (await page.innerText('body')).slice(0, 200), ...problems }, null, 2));
  await browser.close();
}
