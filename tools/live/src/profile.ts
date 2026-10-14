/**
 * m2b-plan.md task 7 on the live deployment. `dev` edits the profile in settings while `aino` (a friend,
 * dev's profile panel open in their DM) and `lotta` (a server member, not a friend, dev's popout open in the
 * member list) watch.
 * - All six fields changed and saved: timed until both see every change, without a reload.
 * - All cleared and saved: both see them gone.
 * - Leaving with unsaved changes asks first.
 * dev's seeded profile is put back at the start and the end. `node tools/live/src/profile.ts [out-dir]`
 */
import { join } from 'node:path';
import type { Locator } from 'playwright-core';
import { loadState } from '../../seed/src/config.ts';
import { PERSONAS } from '../../seed/src/data.ts';
import { seededProfile } from '../../seed/src/seed.ts';
import { encodePng } from '../../seed/src/png.ts';
import { APP, launch, watch } from './browser.ts';
import { signIn } from './login.ts';
import { person, until } from './people.ts';

const out = process.argv[2] ?? '.';
const st = loadState()!;
const results: Record<string, unknown> = {};
const dev = await person('dev');
/** Back to the seeded profile, with nothing extra: it comes out the same every time, even after a failed run. */
async function putBack() {
  const edit = await seededProfile(PERSONAS.find((p) => p.handle === 'dev')!, dev.auth);
  await dev.call('PATCH', '/users/@me', { ...edit, remove: ['Pronouns'] });
}
await putBack();
const browser = await launch();
async function open(handle: string, path: string) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  const problems = watch(page);
  await signIn(page, handle);
  await page.goto(`${APP}${path}`, { waitUntil: 'networkidle' });
  await page.getByText('Connected').waitFor({ timeout: 15_000 }).catch(() => {});
  return { page, problems };
}

const aino = await open('aino', `/channels/@me/${st.channels['dm-aino']}`);
const lotta = await open('lotta', `/channels/${st.serverId}/${st.channels.yleinen}`);
await lotta.page.locator('aside[aria-label=Members]').getByRole('button', { name: /^Open profile of Dev$/ }).click();
const cards: Locator[] = [aino.page.locator('.card.panel'), lotta.page.locator('.card.popout')];
for (const c of cards) await c.waitFor();
const a = await open('dev', '/channels/@me');
await a.page.locator('.dock').getByRole('button', { name: 'User settings' }).click();
await a.page.waitForURL(/\/settings\/profile$/);
await a.page.getByLabel('Display name').waitFor();
await a.page.waitForTimeout(1_000);

const png = (r: number) => ({ name: 'kuva.png', mimeType: 'image/png', buffer: Buffer.from(encodePng(128, 64, (x, y) => [r, x * 2, y * 4, 255])) });
const fields = a.page.locator('.fields');
async function fill() {
  await a.page.getByLabel('Display name').fill('Dev Testaaja');
  await a.page.getByLabel('Pronouns').fill('hän');
  await a.page.getByLabel('Custom status').fill('Profiilitesti');
  await a.page.getByLabel('About me').fill('Uusi **bio** profiilitestistä');
  await fields.locator('.group', { hasText: 'Avatar' }).locator('input[type=file]').setInputFiles(png(220));
  await fields.locator('.group', { hasText: 'Banner' }).locator('input[type=file]').setInputFiles(png(40));
}
const style = (c: Locator) => c.locator('.banner').getAttribute('style');
const avatarSrc = (c: Locator) => c.locator('.avatar-ring img').getAttribute('src');
const bannersBefore = await Promise.all(cards.map(style));
const avatarsBefore = await Promise.all(cards.map(avatarSrc));

// Change all six and save.
await fill();
await a.page.screenshot({ path: join(out, 'profile-editor.png') });
let start = performance.now();
await a.page.getByRole('button', { name: 'Save changes' }).click();
const seen = async (c: Locator, i: number) => ({
  name: await c.getByText('Dev Testaaja', { exact: true }).isVisible(), pronouns: (await c.locator('.username').innerText()).includes('hän'),
  status: await c.locator('.status').getByText('Profiilitesti', { exact: true }).isVisible(), bio: (await c.locator('.bio').innerText().catch(() => '')).includes('profiilitestistä'),
  banner: (await style(c)) !== bannersBefore[i], avatar: (await avatarSrc(c)) !== avatarsBefore[i],
});
for (const [i, c] of cards.entries()) {
  await until(async () => Object.values(await seen(c, i)).every(Boolean), 15_000).catch(async (e: unknown) => {
    console.log(i ? 'lotta' : 'aino', await seen(c, i));
    await (i ? lotta : aino).page.screenshot({ path: join(out, `profile-fail-${i}.png`) });
    throw e;
  });
}
results.allSixSeenMs = Math.round(performance.now() - start);

await lotta.page.screenshot({ path: join(out, 'profile-lotta.png') });

// Clear them all and save.
await a.page.waitForTimeout(5_500);
for (const label of ['Display name', 'Pronouns', 'Custom status', 'About me']) await a.page.getByLabel(label).fill('');
await fields.locator('.group', { hasText: 'Avatar' }).getByRole('button', { name: 'Remove' }).click();
await fields.locator('.group', { hasText: 'Banner' }).getByRole('button', { name: 'Remove' }).click();
start = performance.now();
await a.page.getByRole('button', { name: 'Save changes' }).click();
for (const c of cards) {
  await until(async () => !(await c.getByText('Dev Testaaja', { exact: true }).isVisible()) && !(await c.locator('.username').innerText()).includes('hän')
    && !(await c.locator('.status').isVisible()) && !(await c.locator('.bio').isVisible())
    && !(await style(c))?.includes('url(') && (await avatarSrc(c))?.includes('default_avatar') === true, 15_000);
}
results.clearedSeenMs = Math.round(performance.now() - start);

// Unsaved changes: closing asks first.
await a.page.getByLabel('Pronouns').fill('he/him');
await a.page.getByRole('button', { name: 'Close' }).click();
results.asksBeforeLeaving = await a.page.getByRole('dialog', { name: 'Leave without saving?' }).isVisible();
await a.page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
results.staysAfterCancel = a.page.url().endsWith('/settings/profile');
await a.page.getByRole('button', { name: 'Reset' }).click();

// Put dev back.
await new Promise((r) => setTimeout(r, 5_500));
await putBack();
console.log(JSON.stringify({ ...results, dev: a.problems, aino: aino.problems, lotta: lotta.problems }, null, 2));
await browser.close();

