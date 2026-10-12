/**
 * Review screenshot of the live client: `node tools/live/src/shot.ts <handle> <out.png> [channel name] [width]`.
 * Signs in, opens the channel by name (or the DM home), waits for the network to settle, and saves a PNG.
 */
import { loadState } from '../../seed/src/config.ts';
import { APP, launch, watch } from './browser.ts';
import { signIn } from './login.ts';

const [handle = 'dev', out = 'shot.png', channel, width = '1600'] = process.argv.slice(2);
const state = loadState()!;
const browser = await launch();
const page = await browser.newPage({ viewport: { width: Number(width), height: 900 }, deviceScaleFactor: 1 });
const problems = watch(page);
await signIn(page, handle);
const id = channel ? state.channels[channel] : undefined;
const path = id ? (channel!.startsWith('dm-') || channel === 'group' ? `/channels/@me/${id}` : `/channels/${state.serverId}/${id}`) : '/channels/@me';
await page.goto(`${APP}${path}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.screenshot({ path: out });
console.log(JSON.stringify({ url: page.url(), ...problems }, null, 2));
await browser.close();
