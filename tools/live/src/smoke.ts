/** `node tools/live/src/smoke.ts [path] [out.png]`: load a page of the live client, report problems, save a screenshot. */
import { APP, launch, watch } from './browser.ts';

const path = process.argv[2] ?? '';
const out = process.argv[3];
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const problems = watch(page);
await page.goto(`${APP}${path}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
if (out) await page.screenshot({ path: out });
console.log(JSON.stringify({ url: page.url(), title: await page.title(), text: (await page.innerText('body')).slice(0, 300), ...problems }, null, 2));
await browser.close();
process.exit(problems.failed.length || problems.console.length ? 1 : 0);
