/**
 * Playwright against the live deployment (client.md section 14): review screenshots and live checks.
 * Uses the Chromium build already in Jaakko's user cache, matched by the pinned playwright-core version.
 */
import { chromium, type Browser, type ConsoleMessage, type Page } from 'playwright-core';

export { APP } from '../../target.ts';

export interface PageProblems { failed: string[]; console: string[] }

export async function launch(): Promise<Browser> {
  return chromium.launch({ headless: true });
}

/** Collect failed requests, CSP violations and console errors for a page. */
export function watch(page: Page): PageProblems {
  const problems: PageProblems = { failed: [], console: [] };
  page.on('response', (r) => { if (r.status() >= 400) problems.failed.push(`${r.status()} ${r.url()}`); });
  page.on('requestfailed', (r) => problems.failed.push(`failed ${r.url()} ${r.failure()?.errorText ?? ''}`));
  page.on('console', (m: ConsoleMessage) => { if (m.type() === 'error' || m.type() === 'warning') problems.console.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => problems.console.push(`pageerror: ${e.message}`));
  return problems;
}
