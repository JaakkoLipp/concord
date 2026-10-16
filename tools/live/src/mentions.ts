/**
 * M4.8 task 5: mentions in two servers, bodies loaded through the single-message endpoint,
 * a jump that preserves unread until Esc, and the quick-switcher entry. Temporary fixtures only.
 */
import assert from 'node:assert/strict';
import { loadState } from '../../seed/src/config.ts';
import { APP, launch, watch } from './browser.ts';
import { signIn } from './login.ts';
import { person, until } from './people.ts';
import { checkServer } from './servers.ts';

const st = loadState()!;
const [admin, dev] = await Promise.all([person('dev-admin'), person('dev')]);
const fresh = await checkServer(admin, 'mentions');
const local = await admin.call<{ _id: string }>('POST', `/servers/${st.serverId}/channels`, { type: 'Text', name: 'm48-mentions-check' });
await dev.call('POST', `/invites/${fresh.invite}`);
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
const problems = watch(page);
const fetched = new Set<string>();
page.on('request', (r) => { if (/\/messages\/[0-9A-Z]{26}$/.test(new URL(r.url()).pathname) && r.method() === 'GET') fetched.add(new URL(r.url()).pathname); });
const inbox = () => page.getByRole('dialog', { name: 'Mentions', exact: true });
const row = (id: string) => inbox().locator(`.mention[data-id="${id}"]`);
const tag = Date.now().toString(36);
try {
  await signIn(page, 'dev');
  await page.goto(`${APP}/channels/@me`, { waitUntil: 'networkidle' });
  const a = await admin.call<{ _id: string }>('POST', `/channels/${local._id}/messages`, { content: `<@${dev.id}> First inbox ${tag}` });
  const b = await admin.call<{ _id: string }>('POST', `/channels/${fresh.general}/messages`, { content: `<@${dev.id}> Second inbox ${tag}` });
  await until(async () => {
    const unread = await dev.call<{ _id: { channel: string }; mentions?: string[] }[]>('GET', '/sync/unreads');
    return unread.some((u) => (u.mentions ?? []).includes(a._id)) && unread.some((u) => (u.mentions ?? []).includes(b._id));
  }, 30_000).catch(async (error: unknown) => {
    const unread = await dev.call<{ _id: { channel: string }; mentions?: string[] }[]>('GET', '/sync/unreads');
    console.log('cold unread diagnostics', { a: a._id, b: b._id, unread: unread.filter((u) => [local._id, fresh.general].includes(u._id.channel)) });
    throw error;
  });
  // A fresh store forces the single-message route and the missing-author path, rather than the socket cache.
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Mentions', exact: true }).click();
  await row(a._id).getByText(`First inbox ${tag}`, { exact: false }).waitFor();
  await row(b._id).getByText(`Second inbox ${tag}`, { exact: false }).waitFor();
  assert(fetched.has(`/api/channels/${local._id}/messages/${a._id}`));
  assert(fetched.has(`/api/channels/${fresh.general}/messages/${b._id}`));
  const shown = await inbox().locator('.mention').evaluateAll((els) => els.map((e) => e.getAttribute('data-id')));
  assert(shown.indexOf(b._id) < shown.indexOf(a._id), 'newest first across servers');
  console.log('ok: both servers, fetched bodies, newest first');

  await row(b._id).getByRole('button', { name: 'Jump', exact: true }).click();
  await page.waitForURL((url) => url.pathname.endsWith('/' + b._id));
  await page.locator(`#message-${b._id}`).waitFor();
  await until(async () => await page.locator('dialog[open]').count() === 0);
  await page.locator('.scroller').focus();
  await page.keyboard.press('Escape');
  console.log('ok: inbox jump lands on the target; Esc reads the channel');

  await page.keyboard.press('Control+k');
  const switcher = page.getByRole('dialog', { name: 'Quick switcher', exact: true });
  await switcher.getByRole('combobox').fill('Mentions');
  await switcher.getByRole('option', { name: /Mentions/ }).waitFor();
  await page.keyboard.press('Enter');
  await inbox().waitFor();
  await row(a._id).waitFor();
  assert.equal(await row(b._id).count(), 0, 'reading a channel removes its inbox row');
  assert.equal(await inbox().evaluate((el) => getComputedStyle(el).animationName), 'none', 'keyboard-opened inbox is still');
  console.log('ok: quick switcher entry, read row removed, no keyboard animation');
  await page.keyboard.press('Escape');
  await until(async () => await page.locator('dialog[open]').count() === 0);
  assert.deepEqual(problems.console, [], `no browser errors: ${JSON.stringify(problems.failed)}`);
} finally {
  await browser.close();
  await admin.call('DELETE', `/servers/${fresh.id}`);
  await admin.call('DELETE', `/channels/${local._id}`);
}
console.log('mentions: all passed');
