/**
 * The invite page (m3-plan.md task 7), as a person who isn't a member yet:
 * open an /invite/<code> link signed out, see the preview, log in, come back, join, and land in the server.
 * Then the same link says Open, and a bad code says so. Uses a throwaway m2c-check server, swept at both ends.
 * Usage: node tools/live/src/invite.ts   (dev stack: dev-admin owns the server, tuuli joins)
 */
import { loadState } from '../../seed/src/config.ts';
import { passwordFor } from '../../seed/src/seed.ts';
import { APP, launch, watch } from './browser.ts';
import { person } from './people.ts';
import { checkServer, sweep } from './servers.ts';

const st = loadState()!;
const origin = new URL(APP).origin;
const owner = await person('dev-admin');
const guest = await person('tuuli');
await sweep(owner, [guest]);
const server = await checkServer(owner, 'invite', true);
const failures: string[] = [];
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failures.push(what); };

const browser = await launch();
try {
  const page = await browser.newPage({ viewport: { width: 420, height: 860 } });
  const problems = watch(page);

  await page.goto(`${origin}/invite/${server.invite}`);
  await page.waitForURL(`**/app/invite/${server.invite}`);
  await page.getByRole('heading', { name: server.name }).waitFor({ timeout: 15_000 });
  check(true, 'signed out: /invite/<code> redirects and previews the server');

  await page.getByRole('button', { name: 'Log in to join' }).click();
  await page.waitForURL(/\/app\/login\?next=/);
  await page.getByLabel('Email').fill(st.personas.tuuli?.email ?? `tuuli@${st.emailDomain}`);
  await page.getByLabel('Password').fill(passwordFor('tuuli'));
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL(`**/app/invite/${server.invite}`, { timeout: 20_000 });
  check(true, 'login returns to the invite');

  await page.getByRole('button', { name: 'Join' }).click();
  await page.waitForURL(`**/app/channels/${server.id}/${server.general}`, { timeout: 20_000 });
  check(true, 'Join lands in the server channel');
  // Without our own member record every channel looks hidden, so this would show an empty page until a reload.
  const ready = await page.getByText('Welcome to #General').waitFor({ timeout: 1500 }).then(() => true, () => false);
  check(ready, 'the channel is usable at once after joining, without a reload');

  await page.goto(`${APP}/invite/${server.invite}`);
  await page.getByRole('button', { name: 'Open' }).waitFor({ timeout: 15_000 });
  check(true, 'a member sees Open on the same invite');

  await page.goto(`${APP}/invite/not-a-code`);
  await page.getByText('This invite is invalid or has been revoked.').waitFor({ timeout: 15_000 });
  check(true, 'a bad code says the invite is invalid');

  const unexpected = problems.failed.filter((f) => !f.includes('/invites/not-a-code'));
  check(unexpected.length === 0 && problems.console.filter((c) => !c.includes('404')).length === 0, `no failed requests or console errors${unexpected.length ? `: ${unexpected.join('; ')}` : ''}`);
} catch (e) {
  failures.push(String(e));
  console.log(`FAIL ${String(e).split('\n')[0]}`);
} finally {
  await browser.close();
  await sweep(owner, [guest]);
}
console.log(failures.length ? `invite: ${failures.length} failed` : 'invite: all passed');
process.exit(failures.length ? 1 : 0);
