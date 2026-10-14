/**
 * The welcome link (m3-plan.md task 2), as a brand-new person: account-link.sh on the server makes an account and a
 * link with an invite; the person sets a password, logs in, picks a username, lands on the invite and joins. Then
 * the used link is refused. Uses a throwaway m2c-check server, swept at both ends; the new account stays behind
 * on the dev stack, with a welcome-check address.
 * Usage: node tools/live/src/welcome.ts   (dev stack)
 */
import { ssh, q } from '../../seed/src/ssh.ts';
import { REMOTE_DIR } from '../../seed/src/config.ts';
import { launch, watch } from './browser.ts';
import { person } from './people.ts';
import { checkServer, sweep } from './servers.ts';

const owner = await person('dev-admin');
await sweep(owner);
const server = await checkServer(owner, 'welcome', true);
const stamp = Date.now().toString(36);
const email = `welcome-check-${stamp}@probe.concord.test`;
const password = `Welcome-check-${stamp}-ok`;
const link = (await ssh(`${REMOTE_DIR}/account-link.sh ${q(email)} ${q(server.invite)}`)).trim().split('\n').at(-1)!;
if (!/\/app\/welcome\/[\w-]{32}\?invite=/.test(link)) throw new Error(`account-link.sh printed no link: ${link}`);

const failures: string[] = [];
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failures.push(what); };
const browser = await launch();
try {
  const page = await browser.newPage({ viewport: { width: 420, height: 860 } });
  const problems = watch(page);
  await page.goto(link);
  await page.getByLabel('New password').fill(password);
  await page.getByLabel('Repeat the password').fill(`${password}x`);
  await page.getByRole('button', { name: 'Set password' }).click();
  check(await page.getByText('The two passwords don’t match.').isVisible(), 'mismatched passwords are caught before sending');
  await page.getByLabel('Repeat the password').fill(password);
  await page.getByRole('button', { name: 'Set password' }).click();
  await page.getByRole('heading', { name: 'Password set' }).waitFor({ timeout: 15_000 });
  check(true, 'the link sets the password');

  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL(/\/app\/login\?next=/);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.getByLabel('Username').fill(`wc_${stamp}`);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL(`**/app/invite/${server.invite}`, { timeout: 20_000 });
  check(true, 'login and a username lead on to the invite');
  await page.getByRole('button', { name: 'Join' }).click();
  await page.getByText('Welcome to #General').waitFor({ timeout: 20_000 });
  check(true, 'Join lands in the server');

  const fresh = await browser.newPage();
  await fresh.goto(link);
  await fresh.getByLabel('New password').fill(password);
  await fresh.getByLabel('Repeat the password').fill(password);
  await fresh.getByRole('button', { name: 'Set password' }).click();
  await fresh.getByText('This link has expired or has already been used.').waitFor({ timeout: 15_000 });
  check(true, 'a used link is refused');

  const unexpected = problems.failed.filter((f) => !f.includes('/reset_password'));
  check(unexpected.length === 0, `no failed requests${unexpected.length ? `: ${unexpected.join('; ')}` : ''}`);
} catch (e) {
  failures.push(String(e));
  console.log(`FAIL ${String(e).split('\n')[0]}`);
} finally {
  await browser.close();
  await sweep(owner);
}
console.log(failures.length ? `welcome: ${failures.length} failed` : 'welcome: all passed');
process.exit(failures.length ? 1 : 0);
