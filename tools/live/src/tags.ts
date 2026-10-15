/**
 * m4.5-plan.md task 10 on the local stack, server tags on Concord's own layer:
 * - `dev-admin` enables a tag on the seeded server in its settings, with one of its emoji as the badge,
 * - `pekka` chooses it in his profile settings (the plan names aino; pekka has no roles, so leaving and joining
 *   again below leaves the seed as it was),
 * - `dev` sees it next to pekka's name in messages and the member list,
 * - `dev`, who can't create servers, gets 403 enabling a tag over the API,
 * - after pekka leaves the server, `dev` no longer sees it; he joins again by the seed's invite.
 * The tag is disabled afterwards, whatever happens.
 * `node tools/live/src/tags.ts [screenshot-dir]`
 */
import { join } from 'node:path';
import type { Page } from 'playwright-core';
import { loadState } from '../../seed/src/config.ts';
import { APP, launch, watch } from './browser.ts';
import { signIn } from './login.ts';
import { person, until } from './people.ts';

const st = loadState()!;
const out = process.argv[2];
const server = st.serverId;
const channel = st.channels.offtopic!;
const api = `${new URL(APP).origin}/app/api/v1`;
let failed = 0;
function check(ok: boolean, what: string, detail = ''): void {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ` -> ${detail}` : ''}`);
}
const shows = (p: Promise<unknown>) => p.then(() => true, () => false);

const [admin, pekka, dev] = await Promise.all(['dev-admin', 'pekka', 'dev'].map(person));
const layer = (token: string, method: string, path: string, body?: unknown) => fetch(`${api}${path}`, {
  method, headers: { 'x-session-token': token, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}),
});

const browser = await launch();
async function open(handle: string, path: string) {
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const problems = watch(page);
  await signIn(page, handle);
  await page.goto(`${APP}${path}`, { waitUntil: 'networkidle' });
  return { page, problems };
}
/** The client fetches tags every 60 s and when the window regains focus: a focus event asks now. */
const refresh = (p: Page) => p.evaluate(() => window.dispatchEvent(new Event('focus')));

try {
  // 1. dev-admin enables the tag.
  const a = await open('dev-admin', `/server-settings/${server}/tag`);
  await a.page.getByLabel('Tag', { exact: true }).fill('SLOP');
  await a.page.getByRole('radiogroup', { name: 'Badge' }).getByRole('radio').first().click();
  await a.page.getByRole('button', { name: 'Enable tag' }).click();
  const enabled = await until(async () => {
    const r = await layer(admin!.token, 'GET', `/tags/servers?ids=${server}`);
    return ((await r.json()) as { servers: Record<string, { tag: string }> }).servers[server]?.tag === 'SLOP';
  }, 8_000).then(() => true, () => false);
  check(enabled, 'dev-admin enables the tag SLOP in the server settings');
  if (out) await a.page.screenshot({ path: join(out, 'tag-settings.png') });

  // 2. pekka wears it.
  const p = await open('pekka', '/settings/profile');
  const choice = p.page.getByRole('radiogroup', { name: 'Server tag' }).getByRole('radio', { name: /SLOP/ });
  await refresh(p.page);
  await choice.waitFor({ timeout: 10_000 });
  await choice.click();
  const wearing = await shows(p.page.getByRole('radio', { name: /SLOP/, checked: true }).waitFor({ timeout: 8_000 }));
  check(wearing, 'pekka chooses it in his profile settings');

  // 3. dev sees it next to pekka's name: on the first of his messages in a row, which carries the name.
  await pekka!.call('POST', `/channels/${channel}/messages`, { content: `tagitesti ${Date.now().toString(36)}` });
  const d = await open('dev', `/channels/${server}/${channel}`);
  await refresh(d.page);
  const inMessages = await shows(d.page.locator('article.message', { hasText: 'tagitesti' }).getByRole('button', { name: /Server tag SLOP/ }).last().waitFor({ timeout: 10_000 }));
  check(inMessages, 'dev sees SLOP next to pekka’s name in messages');
  const inMembers = await shows(d.page.getByRole('complementary', { name: 'Members' }).getByRole('button', { name: /Pekka Ojala/ }).locator('[aria-label^="Server tag SLOP"]').waitFor({ timeout: 10_000 }));
  check(inMembers, 'and in the member list');
  if (out) await d.page.screenshot({ path: join(out, 'tag-shown.png') });
  await d.page.locator('article.message', { hasText: 'tagitesti' }).getByRole('button', { name: /Server tag SLOP/ }).last().click();
  check(await shows(d.page.getByRole('dialog').getByText('Concord').first().waitFor({ timeout: 3_000 })), 'clicking the tag shows its server');
  await d.page.keyboard.press('Escape');

  // 4. dev can't enable a tag.
  const refused = await layer(dev!.token, 'PUT', `/tags/servers/${server}`, { tag: 'NOPE', emoji: st.emoji ? Object.values(st.emoji)[0] : server });
  check(refused.status === 403, 'dev, who can’t create servers, gets 403 enabling a tag over the API', `${refused.status} ${await refused.text()}`);

  // 5. pekka leaves: his tag goes from dev's view.
  await pekka!.call('DELETE', `/servers/${server}`);
  const gone = await until(async () => (await d.page.locator('[aria-label^="Server tag SLOP"]').count()) === 0, 10_000).then(() => true, () => false);
  check(gone, 'after pekka leaves the server, dev no longer sees his tag');
} catch (e) {
  failed++;
  console.log(`FAIL ${String(e).split('\n')[0]}`);
} finally {
  // Back as seeded: pekka in the server, no tag anywhere.
  await pekka!.call('POST', `/invites/${st.inviteCode}`).catch(() => {});
  await layer(admin!.token, 'DELETE', `/tags/servers/${server}`).catch(() => {});
  await browser.close();
}
console.log(failed ? `tags: ${failed} failed` : 'tags: all passed');
process.exit(failed ? 1 : 0);
