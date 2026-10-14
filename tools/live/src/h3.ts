/**
 * HTTP/3 check: Caddy serves /app over QUIC on UDP 443 and advertises it in Alt-Svc.
 * Chromium is told to use QUIC from the first request, because a normal browser keeps reusing its open HTTP/2
 * connection and switches only on a later connection, which a short check can't wait for.
 * Usage: node tools/live/src/h3.ts
 */
import { chromium } from 'playwright-core';
import { APP } from './browser.ts';

const origin = new URL(APP);
const altSvc = (await fetch(APP)).headers.get('alt-svc') ?? '';
const browser = await chromium.launch({ headless: true, args: [`--origin-to-force-quic-on=${origin.host}:443`] });
const page = await browser.newPage();
await page.goto(APP, { waitUntil: 'load' });
const protocol = await page.evaluate(() => (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming).nextHopProtocol);
await browser.close();
console.log(`alt-svc: ${altSvc || '(none)'}; protocol with QUIC forced: ${protocol}`);
if (!altSvc.includes('h3=') || protocol !== 'h3') {
  console.error('FAIL: HTTP/3 is not served or not advertised');
  process.exit(1);
}
console.log('ok: HTTP/3 served and advertised');
