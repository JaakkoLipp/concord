/**
 * M1 task 8: the reconnect check on the live deployment (m1-plan.md). `dev` has #yleinen open; the browser
 * goes offline for 60 seconds while `aino` posts three messages, edits one and deletes one over the API.
 * After coming back, the visible history must match GET history exactly: same IDs, same contents.
 * `node tools/live/src/reconnect.ts [screenshot.png]`
 */
import { loadState } from '../../seed/src/config.ts';
import { api } from '../../seed/src/http.ts';
import { login, passwordFor } from '../../seed/src/seed.ts';
import { APP, launch, watch } from './browser.ts';
import { signIn } from './login.ts';

const st = loadState()!;
const channel = st.channels.yleinen!;
const browser = await launch();
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await context.newPage();
const problems = watch(page);
await signIn(page, 'dev');
await page.goto(`${APP}/channels/${st.serverId}/${channel}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

const aino = { session: (await login(st.personas.aino!.email, passwordFor('aino'))).token };
type M = { _id: string; author: string; content?: string };
const history = async (limit: number) => (await api<M[]>('GET', `/channels/${channel}/messages?limit=${limit}`, { auth: aino })).reverse();
const mine = (await history(100)).filter((m) => m.author === st.personas.aino!.userId && m.content);
const toEdit = mine.at(-1)!;
const toDelete = mine.at(-2)!;

await context.setOffline(true);
const offlineAt = Date.now();
const tag = Date.now().toString(36);
for (let i = 1; i <= 3; i++) await api('POST', `/channels/${channel}/messages`, { auth: aino, body: { content: `yhteystesti ${tag} ${i}` } });
await api('PATCH', `/channels/${channel}/messages/${toEdit._id}`, { auth: aino, body: { content: `${toEdit.content} (muokattu offline ${tag})` } });
await api('DELETE', `/channels/${channel}/messages/${toDelete._id}`, { auth: aino });
await page.waitForTimeout(Math.max(0, 60_000 - (Date.now() - offlineAt)));
await context.setOffline(false);
const back = Date.now();

// Wait for the cold start: the last message posted while offline appears.
await page.getByText(`yhteystesti ${tag} 3`).waitFor({ timeout: 45_000 });
const recoveredMs = Date.now() - back;
await page.waitForTimeout(1500);

const visible = await page.$$eval('[data-id]', (els) => els.map((e) => ({ id: (e as HTMLElement).dataset.id!, text: (e as HTMLElement).textContent ?? "" })));
const server = await history(visible.length);
const ids = (xs: { id?: string; _id?: string }[]) => xs.map((x) => x.id ?? x._id);
const sameIds = JSON.stringify(ids(visible)) === JSON.stringify(ids(server));
const dupes = visible.length - new Set(ids(visible)).size;
const editShown = visible.find((v) => v.id === toEdit._id)?.text.includes(`(muokattu offline ${tag})`) ?? false;
const deleteGone = !visible.some((v) => v.id === toDelete._id);
// Rendered text differs from raw markdown (mentions, emoji), so compare each message's longest plain word.
const word = (c: string) => (c.replace(/<[^>]*>|:[0-9A-Z]{26}:|https?:\/\/\S+/g, ' ').match(/\p{L}{3,}/gu) ?? []).sort((a, b) => b.length - a.length)[0];
const contentMismatches = server.filter((m) => { const w = m.content ? word(m.content) : undefined; return !!w && !visible.find((v) => v.id === m._id)?.text.includes(w); });
if (process.argv[2]) await page.screenshot({ path: process.argv[2] });
console.log(JSON.stringify({
  recoveredMs, visible: visible.length, sameIds, dupes, editShown, deleteGone, contentMismatches: contentMismatches.map((m) => m._id), ...problems,
}, null, 2));
await browser.close();
