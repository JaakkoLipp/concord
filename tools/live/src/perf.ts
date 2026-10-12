/**
 * M1 task 9: performance numbers on the live deployment against the product brief's budgets.
 * Headless Chromium without a GPU, so frame rates are a lower bound. `node tools/live/src/perf.ts`
 */
import { loadState } from '../../seed/src/config.ts';
import { APP, launch } from './browser.ts';
import { signIn } from './login.ts';

const st = loadState()!;
const browser = await launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await context.newPage();
await signIn(page, 'dev');
const yleinen = `${APP}/channels/${st.serverId}/${st.channels.yleinen}`;
await page.goto(yleinen, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

// 1. JavaScript loaded for the first screen, from a fresh page load with a warm HTTP cache.
const coldPage = await context.newPage();
const js: { url: string; transfer: number; size: number }[] = [];
coldPage.on('response', async (r) => {
  if (!r.url().endsWith('.js')) return;
  const body = await r.body().catch(() => Buffer.alloc(0));
  const enc = r.headers()['content-encoding'] ?? '';
  js.push({ url: r.url(), transfer: Number(r.headers()['content-length'] ?? 0), size: body.length + (enc ? 0 : 0) });
});
const t0 = Date.now();
await coldPage.goto(yleinen, { waitUntil: 'domcontentloaded' });
await coldPage.locator('[data-id]').last().waitFor();
const coldStartMs = Date.now() - t0;
await coldPage.waitForLoadState('networkidle');
const resources = await coldPage.evaluate(() => (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
  .filter((e) => e.name.endsWith('.js')).map((e) => ({ name: e.name.split('/').pop(), encoded: e.encodedBodySize, decoded: e.decodedBodySize })));
const jsEncoded = resources.reduce((n, r) => n + r.encoded, 0);
const jsDecoded = resources.reduce((n, r) => n + r.decoded, 0);
const lazy = resources.filter((r) => /highlight|katex|languages/i.test(r.name ?? ''));

// 2. Cold start again, with every cache warm (the budget's case).
const t1 = Date.now();
await coldPage.reload({ waitUntil: 'domcontentloaded' });
await coldPage.locator('[data-id]').last().waitFor();
const warmStartMs = Date.now() - t1;

// 3. Channel switch: first visit fetches history, the second is cached.
async function switchTo(name: string): Promise<number> {
  const start = Date.now();
  await coldPage.locator('nav[aria-label=Channels]').getByRole('link', { name: new RegExp(`^${name}`) }).click();
  await coldPage.waitForURL(new RegExp(st.channels[name === 'off-topic' ? 'offtopic' : name]!));
  await coldPage.locator('[role=log] [data-id]').last().waitFor();
  await coldPage.waitForFunction((id) => location.pathname.includes(id) && document.querySelectorAll('[role=log] [data-id]').length > 5, st.channels[name === 'off-topic' ? 'offtopic' : name]!);
  return Date.now() - start;
}
const firstSwitch = await switchTo('off-topic');
await switchTo('yleinen');
const cachedSwitch = await switchTo('off-topic');

// 4. Scrolling: walk up through yleinen's history while counting frames.
await coldPage.goto(yleinen, { waitUntil: 'networkidle' });
await coldPage.waitForTimeout(1000);
const scroll = await coldPage.evaluate(async () => {
  const el = document.querySelector('[role=log]') as HTMLElement;
  let frames = 0;
  let worst = 0;
  let last = performance.now();
  let running = true;
  const tickFn = (t: number) => { frames++; worst = Math.max(worst, t - last); last = t; if (running) requestAnimationFrame(tickFn); };
  requestAnimationFrame(tickFn);
  const start = performance.now();
  for (let i = 0; i < 240; i++) {
    el.scrollTop -= 60;
    await new Promise((r) => requestAnimationFrame(r));
  }
  running = false;
  const seconds = (performance.now() - start) / 1000;
  return { fps: Math.round(frames / seconds), worstFrameMs: Math.round(worst), rows: document.querySelectorAll('[data-id]').length };
});

// 5. Memory in this tab after the walk.
const memory = await coldPage.evaluate(() => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0);

console.log(JSON.stringify({
  initialJs: { files: resources.length, transferKB: Math.round(jsEncoded / 1024), uncompressedKB: Math.round(jsDecoded / 1024), lazyLoaded: lazy.map((l) => l.name) },
  coldStartMs, warmStartMs, channelSwitch: { firstMs: firstSwitch, cachedMs: cachedSwitch }, scroll, jsHeapMB: Math.round(memory / 1048576),
}, null, 2));
await browser.close();
