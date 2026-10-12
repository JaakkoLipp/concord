/**
 * Review screenshots of the live client for m1-results.md, sized like the reference screenshots:
 * those were taken at 125% display scaling, so the same CSS viewport is shot at a 1.25 pixel ratio.
 * `node tools/live/src/review.ts docs/m1-results`
 */
import { join } from 'node:path';
import { loadState } from '../../seed/src/config.ts';
import { APP, launch } from './browser.ts';
import { signIn } from './login.ts';

const out = process.argv[2] ?? '.';
const st = loadState()!;
const browser = await launch();
const shots: [string, string, number, number, number][] = [
  // name, path, CSS width, CSS height, scale
  ['server-view.png', `/channels/${st.serverId}/${st.channels.yleinen}`, 1189, 1006, 1.25],
  ['dm-view.png', `/channels/@me/${st.channels['dm-aino']}`, 1442, 1278, 1.25],
  ['tekniikka.png', `/channels/${st.serverId}/${st.channels.tekniikka}`, 1189, 1006, 1.25],
  ['media.png', `/channels/${st.serverId}/${st.channels.kuvat}`, 1189, 1006, 1.25],
  ['narrow-1000.png', `/channels/${st.serverId}/${st.channels.pelit}`, 1000, 800, 1],
  ['phone-390.png', `/channels/${st.serverId}/${st.channels.pelit}`, 390, 844, 2],
];
for (const [name, path, w, h, scale] of shots) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
  const page = await context.newPage();
  await signIn(page, 'dev');
  await page.goto(`${APP}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(out, name) });
  await context.close();
  console.log(name);
}
await browser.close();
