/**
 * M2a task 6 on the live deployment: `node tools/live/src/attachments.ts [out.png]`.
 * `dev` attaches an image and a PDF through the file button, one image by paste and one by drop, and
 * sends; `aino` sees them. Oversized files and a sixth file are refused before any upload.
 */
import type { Page } from 'playwright-core';
import { loadState } from '../../seed/src/config.ts';
import { encodePng } from '../../seed/src/png.ts';
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
const png = (w: number, h: number, hue: number) => Buffer.from(encodePng(w, h, (x, y) => [(x * hue) % 256, (y * 3) % 256, 160, 255]));
const pdf = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');
const tiles = (page: Page) => page.locator('.tiles .tile').count();
const toasts = (page: Page) => page.locator('.toast').allInnerTexts();
/** Fire a paste or drop of one PNG in the page, as a browser would for a screenshot. */
const synthetic = (page: Page, type: 'paste' | 'drop', selector: string, name: string) => page.evaluate(async ({ type, selector, name }) => {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 48;
  canvas.getContext('2d')!.fillRect(0, 0, 64, 48);
  const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/png'));
  const dt = new DataTransfer();
  dt.items.add(new File([blob], name, { type: 'image/png' }));
  const el = document.querySelector(selector)!;
  if (type === 'paste') el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  else {
    el.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true, cancelable: true }));
    el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }
}, { type, selector, name });
const results: Record<string, unknown> = {};

const dev = await open('dev');
const aino = await open('aino');
await dev.page.bringToFront();
const input = dev.page.locator('.composer .file-input');
const tag = Date.now().toString(36);

// Refusals first: one oversized file, then six files where five fit.
await input.setInputFiles([{ name: 'iso.bin', mimeType: 'application/octet-stream', buffer: Buffer.alloc(21_000_000) }]);
results.oversizedTiles = await tiles(dev.page);
results.oversizedNotice = await toasts(dev.page);
await input.setInputFiles(Array.from({ length: 6 }, (_, i) => ({ name: `kuva${i}.png`, mimeType: 'image/png', buffer: png(32, 32, i + 1) })));
results.sixFilesTiles = await tiles(dev.page);
results.sixFilesNotice = (await toasts(dev.page)).at(-1);
for (let i = 0; i < 5; i++) await dev.page.locator('.tiles').getByRole('button', { name: /^Remove / }).first().click();
results.tilesAfterRemove = await tiles(dev.page);

// The real message: button, paste and drop.
await input.setInputFiles([
  { name: `testikuva-${tag}.png`, mimeType: 'image/png', buffer: png(640, 360, 7) },
  { name: `ohje-${tag}.pdf`, mimeType: 'application/pdf', buffer: pdf },
]);
await synthetic(dev.page, 'paste', '.composer .cm-content', `liitetty-${tag}.png`);
await synthetic(dev.page, 'drop', '.conversation', `pudotettu-${tag}.png`);
results.tilesBeforeSend = await tiles(dev.page);
await dev.page.screenshot({ path: process.argv[2] ?? 'attachments.png' });
await dev.page.locator('.composer .cm-content').click();
await dev.page.keyboard.type(`liitteet ${tag}`);
const t0 = Date.now();
await dev.page.keyboard.press('Enter');
results.pendingShowsUploads = await dev.page.locator('.message.sending .uploads li').count().catch(() => 0);
const sent = aino.page.locator('article.message', { hasText: `liitteet ${tag}` }).last();
await sent.waitFor({ timeout: 30_000 });
results.sendMs = Date.now() - t0;
await aino.page.waitForTimeout(1500);
results.ainoSees = {
  images: await sent.locator('img').evaluateAll((els) => els.filter((e) => (e as HTMLImageElement).src.includes('/autumn/attachments/')).length),
  text: (await sent.innerText()).replace(/\s+/g, ' ').slice(0, 200),
};
results.devPendingLeft = await dev.page.locator('.message.sending, .message.failed').count();
results.devTilesLeft = await tiles(dev.page);

console.log(JSON.stringify({ ...results, problems: { dev: dev.problems, aino: aino.problems } }, null, 2));
await browser.close();
