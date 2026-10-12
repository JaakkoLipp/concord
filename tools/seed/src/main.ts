/**
 * Concord development seed. Runs on Jaakko's machine against the VPS stack (docs/dev-environment.md section 5).
 *
 *   pnpm seed --reset          wipe the VPS stack's data and build the dataset from scratch
 *   pnpm seed                  build the dataset, only if the database has no accounts yet
 *   pnpm seed account <handle> one extra plain account that joins the server
 *   pnpm seed password <handle> print a persona's email, password and, for totp, the current code
 *   pnpm seed hold             keep about 15 personas online until Ctrl+C
 *   pnpm seed check            the M0 verifications, printed as JSON
 */
import { loadState } from './config.ts';
import { PERSONAS, TOTP } from './data.ts';
import { checks } from './checks.ts';
import { api } from './http.ts';
import { hold } from './hold.ts';
import { makeAccount, passwordFor, seed } from './seed.ts';
import { totp } from './totp.ts';
import { accountCount, resetData } from './vps.ts';

const [cmd, arg] = process.argv.slice(2);

async function main() {
  switch (cmd) {
    case undefined:
    case '--reset': {
      if (cmd === '--reset') {
        console.log('wiping the development stack');
        await resetData();
      } else if ((await accountCount()) > 0) {
        throw new Error('the database already has accounts; use `pnpm seed --reset` to start over');
      }
      await seed();
      return;
    }
    case 'account': {
      if (!arg || !/^[a-z0-9_.-]{2,32}$/.test(arg)) throw new Error('usage: pnpm seed account <handle>');
      const state = loadState();
      if (!state) throw new Error('no seed state; run pnpm seed first');
      const live = await makeAccount(arg, arg, state.emailDomain);
      await api('POST', `/invites/${state.inviteCode}`, { auth: live.auth });
      console.log(`${live.user.username}#${live.user.discriminator}\nemail: ${live.email}\npassword: ${passwordFor(arg)}`);
      return;
    }
    case 'password': {
      const state = loadState();
      const p = arg && state?.personas[arg];
      if (!p) throw new Error(`unknown handle; known: ${PERSONAS.map((x) => x.handle).join(', ')}`);
      console.log(`${p.username}\nemail: ${p.email}\npassword: ${passwordFor(p.handle)}`);
      if (arg === TOTP && p.totpSecret) console.log(`totp now: ${totp(p.totpSecret)}`);
      return;
    }
    case 'check':
      await checks();
      return;
    case 'hold':
      await hold();
      return;
    default:
      throw new Error(`unknown command ${cmd}`);
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
