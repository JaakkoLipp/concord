/**
 * M4.8 task 8 on the local stack: `node tools/live/src/account.ts`. A throwaway account, made here as
 * `pnpm seed account` makes one, signs in through the login page and opens Settings, My account. It sees its email
 * and this device, marked, under the browser's name. It logs out a second session with its password, and that
 * session's token stops working while this one stays. It changes its password and logs in with the new one; the
 * other sessions stay signed in, as Stoat does. With the stored session ID removed, as for a browser signed in
 * before M4.8, nothing is marked and only "Log out all other devices" is offered, which ends every other session.
 * The email change sends its link and leaves the email as it was until then. Task 9: two-factor turns on with the
 * key shown beside its QR code, a TOTP code then logs in, the confirmation asks for a code instead of the password,
 * ten new recovery codes are shown, and one of them turns two-factor off. Every session made here is revoked, and
 * TOTP ends off.
 */
import { loadState } from '../../seed/src/config.ts';
import { api } from '../../seed/src/http.ts';
import { makeAccount, passwordFor } from '../../seed/src/seed.ts';
import { totp } from '../../seed/src/totp.ts';
import { assertDevStack } from '../../seed/src/vps.ts';
import { APP, launch, watch } from './browser.ts';
import { signIn } from './login.ts';
import { until } from './people.ts';

await assertDevStack();
const st = loadState()!;
let failed = 0;
function check(ok: boolean, what: string, detail = ''): void {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ` -> ${detail}` : ''}`);
}

const handle = `acct${Date.now().toString(36)}`;
const live = await makeAccount(handle, handle, st.emailDomain);
console.log(`throwaway account ${live.email}`);
const seedToken = (live.auth as { session: string }).session;
const tokens = new Set<string>([seedToken]);
const loginApi = async (password: string, name: string) => {
  const r = await api<{ result: string; token: string; _id: string }>('POST', '/auth/session/login', { body: { email: live.email, password, friendly_name: name } });
  tokens.add(r.token);
  return r;
};
const works = (token: string) => api('GET', '/users/@me', { auth: { session: token } }).then(() => true, () => false);
const second = await loginApi(passwordFor(handle), 'Concord check B');

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const problems = watch(page);
await signIn(page, handle);
const browserToken = await page.evaluate(() => new Promise<string>((resolve) => {
  const req = indexedDB.open('concord');
  req.onsuccess = () => { const g = req.result.transaction('session').objectStore('session').get('token'); g.onsuccess = () => resolve(g.result as string); };
}));
tokens.add(browserToken);

await page.goto(`${APP}/settings/account`, { waitUntil: 'networkidle' });
const sessionsList = page.locator('ul.sessions');
await sessionsList.waitFor();
const bodyText = await page.innerText('main, body');
check(bodyText.includes(live.email), 'the email is shown');
const mine = page.locator('ul.sessions li', { has: page.locator('.chip') });
check(await mine.count() === 1, 'one session is marked This device');
const mineName = await mine.locator('.name').innerText().catch(() => '');
check(/^Concord on Chrome, Linux$/.test(mineName), 'this device is named after the browser', mineName);

// Logging out the second session asks for the password, and its token stops working.
const rowB = page.locator('ul.sessions li', { hasText: 'Concord check B' });
await rowB.getByRole('button', { name: 'Log out Concord check B' }).click();
const confirm = page.getByRole('dialog', { name: 'Confirm it’s you' });
await confirm.getByLabel('Password').fill('wrong password');
await confirm.getByRole('button', { name: 'Confirm' }).click();
check(await confirm.getByText('Wrong password.').waitFor({ timeout: 5_000 }).then(() => true, () => false), 'a wrong password stays in the dialog');
await confirm.getByLabel('Password').fill(passwordFor(handle));
await confirm.getByRole('button', { name: 'Confirm' }).click();
await rowB.waitFor({ state: 'detached', timeout: 8_000 }).catch(() => {});
check(await until(async () => !(await works(second.token)), 8_000).then(() => true, () => false), 'the second session’s token stops working');
check(await works(browserToken), 'this device’s session still works');

// The password change: no ticket with TOTP off, and the other sessions stay.
const next = `${passwordFor(handle)}-uusi`;
await page.getByRole('button', { name: 'Change password' }).click();
const pw = page.getByRole('dialog', { name: 'Change your password' });
await pw.getByLabel('Current password').fill(passwordFor(handle));
await pw.getByLabel('New password', { exact: true }).fill(next);
await pw.getByLabel('Repeat the new password').fill(next);
await pw.getByRole('button', { name: 'Change password' }).click();
check(await page.getByText('Password changed.').waitFor({ timeout: 8_000 }).then(() => true, () => false), 'the password change is confirmed');
const viaNew = await loginApi(next, 'Concord check C').then(() => true, () => false);
check(viaNew, 'the new password logs in');
check(!(await loginApi(passwordFor(handle), 'Concord check D').then(() => true, () => false)), 'the old one no longer does');
check(await works(seedToken), 'another session stays signed in after the change, as Stoat does');

// A browser signed in before M4.8 has no session ID: no mark, no single logouts, only the logout of the others.
await page.evaluate(() => new Promise<void>((resolve) => {
  const req = indexedDB.open('concord');
  req.onsuccess = () => { const d = req.result.transaction('session', 'readwrite').objectStore('session').delete('session-id'); d.onsuccess = () => resolve(); };
}));
await page.reload({ waitUntil: 'networkidle' });
await sessionsList.waitFor();
check(await page.locator('ul.sessions .chip').count() === 0, 'without a stored session ID nothing is marked');
check(await page.locator('ul.sessions').getByRole('button', { name: /^Log out / }).count() === 0, 'and there is no single logout');
check(await page.getByText('Log in again on this browser').count() === 1, 'it says how to get them');
await page.getByRole('button', { name: 'Log out all other devices' }).click();
await confirm.getByLabel('Password').fill(next);
await confirm.getByRole('button', { name: 'Confirm' }).click();
check(await until(async () => !(await works(seedToken)), 8_000).then(() => true, () => false), 'Log out all other devices ends the other sessions');
check(await works(browserToken), 'and keeps this one');
check(await page.locator('ul.sessions li').count() === 1, 'one session is listed after it');

// The email change sends a verification link (local Mailpit), and the email stays until it is followed.
const changeEmail = page.getByRole('button', { name: 'Change email' });
if (await changeEmail.count()) {
  const newEmail = `${handle}-uusi@${st.emailDomain}`;
  await changeEmail.click();
  const em = page.getByRole('dialog', { name: 'Change your email' });
  await em.getByLabel('New email').fill(newEmail);
  await em.getByLabel('Current password').fill(next);
  await em.getByRole('button', { name: 'Send the link' }).click();
  check(await page.getByText(`Check ${newEmail}`).waitFor({ timeout: 8_000 }).then(() => true, () => false), 'the email change says to check the new address');
  const now = await api<{ email: string }>('GET', '/auth/account/', { auth: { session: browserToken } });
  check(now.email === live.email, 'the email is unchanged until the link is followed', now.email);
} else {
  check(false, 'Change email is shown where the server sends mail');
}

// Two-factor (task 9): on with the shown key, a TOTP login, new recovery codes, and off with a recovery code.
// Stoat takes each code once and only in its own 30-second window, so every code here waits for a fresh window.
let lastCode = '';
async function freshCode(secret: string): Promise<string> {
  for (;;) {
    const into = Date.now() % 30_000;
    if (into >= 4_000 && into <= 22_000 && totp(secret) !== lastCode) return (lastCode = totp(secret));
    await new Promise((r) => setTimeout(r, 1_000));
  }
}
await page.getByRole('button', { name: 'Turn on two-factor' }).click();
await confirm.getByLabel('Password').fill(next);
await confirm.getByRole('button', { name: 'Confirm' }).click();
const secretBox = page.locator('code.secret');
await secretBox.waitFor({ timeout: 8_000 });
const secret = (await secretBox.innerText()).replace(/\s+/g, '');
check(await page.getByRole('img', { name: 'QR code for your authenticator app' }).waitFor({ timeout: 8_000 }).then(() => true, () => false), 'the setup shows a QR code');
check((await page.locator('a', { hasText: 'Open in an authenticator app' }).getAttribute('href'))?.startsWith(`otpauth://totp/Concord%3A${encodeURIComponent(live.email)}?secret=${secret}`) ?? false, 'and an otpauth link with the key');
await page.locator('form.confirm').getByLabel('Authentication code').fill(await freshCode(secret));
await page.locator('form.confirm').getByRole('button', { name: 'Turn on' }).click();
check(await page.getByText('Two-factor authentication is on.').waitFor({ timeout: 8_000 }).then(() => true, () => false), 'two-factor turns on with a code from the key',
  await page.locator('form.confirm .note').innerText({ timeout: 500 }).catch(() => ''));
const mfaStatus = () => api<{ totp_mfa?: boolean }>('GET', '/auth/mfa/', { auth: { session: browserToken } });
check((await mfaStatus()).totp_mfa === true, 'Stoat has TOTP on');

const first = await api<{ result: string; ticket: string }>('POST', '/auth/session/login', { body: { email: live.email, password: next, friendly_name: 'Concord check E' } });
check(first.result === 'MFA', 'logging in now asks for a code', first.result);
const viaTotp = await api<{ result: string; token: string }>('POST', '/auth/session/login', { body: { mfa_ticket: first.ticket, mfa_response: { totp_code: await freshCode(secret) }, friendly_name: 'Concord check E' } }).catch(() => null);
if (viaTotp?.token) tokens.add(viaTotp.token);
check(viaTotp?.result === 'Success', 'and a TOTP code logs in');

await page.getByRole('button', { name: 'Make new recovery codes' }).click();
check(await confirm.getByLabel('Authentication code').waitFor({ timeout: 5_000 }).then(() => true, () => false), 'with TOTP on, the confirmation asks for a code, not the password');
await confirm.getByLabel('Authentication code').fill(await freshCode(secret));
await confirm.getByRole('button', { name: 'Confirm' }).click();
const codeList = page.getByRole('list', { name: 'Recovery codes' });
await codeList.waitFor({ timeout: 8_000 }).catch(() => {});
const codes = await codeList.locator('code').allInnerTexts().catch(() => [] as string[]);
check(codes.length === 10, 'ten new recovery codes are shown', String(codes.length));

await page.getByRole('button', { name: 'Turn off two-factor' }).click();
await confirm.getByRole('button', { name: 'Use a recovery code instead' }).click();
await confirm.getByLabel('Recovery code').fill(codes[0] ?? '');
await confirm.getByRole('button', { name: 'Confirm' }).click();
check(await page.getByText('Two-factor authentication is off.').waitFor({ timeout: 8_000 }).then(() => true, () => false), 'a recovery code turns two-factor off');
check((await mfaStatus()).totp_mfa !== true, 'Stoat has TOTP off');

// The 401s are the wrong password asked for on purpose; a 429 is a rate-limit wait the client sits out.
const errors = problems.console.filter((c) => !c.includes('429') && !c.includes('401'));
check(errors.length === 0, 'no other console errors', errors.slice(0, 3).join(' | '));
await browser.close();
// Every session this check made ends; the account itself stays (Stoat deletes accounts only through a mail link).
for (const token of tokens) await api('POST', '/auth/session/logout', { auth: { session: token } }).catch(() => {});
console.log(failed ? `account: ${failed} failed` : 'account: all passed');
process.exit(failed ? 1 : 0);
