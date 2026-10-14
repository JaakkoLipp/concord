import { sameHost } from '../../target.ts';
import { REMOTE_DIR } from './config.ts';
import { q, ssh } from './ssh.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Refuse to touch anything but a dev stack. Production has no .allow-wipe (dev-environment.md section 8), so the
 * seed can never create personas or servers next to real people, even on an empty database.
 */
export async function assertDevStack(): Promise<void> {
  // The check runs over SSH, while the seed and the live checks use the API and the app: all must be one stack.
  sameHost();
  const out = await ssh(`test -f ${REMOTE_DIR}/.allow-wipe && echo dev || echo production`);
  if (out.trim() !== 'dev') throw new Error(`${REMOTE_DIR}/.allow-wipe is missing: this is not a dev stack, so the seed won't run here`);
}

/** Create an account over the stack's internal network, since Caddy refuses public sign-up. */
export async function createAccount(email: string, password: string): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const out = await ssh(`${REMOTE_DIR}/create-account.sh ${q(email)} ${q(password)}`);
    const status = /HTTP (\d+)/.exec(out)?.[1];
    if (status === '204') return;
    if (status === '429') {
      const after = Number(/"retry_after":\s*(\d+)/.exec(out)?.[1] ?? 2000);
      await sleep(after + 100);
      continue;
    }
    throw new Error(`create-account for ${email} failed: ${out.trim()}`);
  }
  throw new Error(`create-account for ${email}: still rate limited`);
}

interface MailpitSearch {
  messages: { ID: string; Created: string; To: { Address: string }[] }[];
}

/** Read Mailpit on the VPS's loopback and return the newest token from a /login/verify/ link sent to `email`. */
export async function verificationToken(email: string, after: Date): Promise<string> {
  const query = encodeURIComponent(`to:"${email}"`);
  for (let i = 0; i < 60; i++) {
    const found = JSON.parse(await ssh(`curl -sf 'http://127.0.0.1:8025/api/v1/search?query=${query}&limit=5'`)) as MailpitSearch;
    const recent = found.messages.filter((m) => new Date(m.Created) >= new Date(after.getTime() - 120_000));
    for (const m of recent) {
      const msg = JSON.parse(await ssh(`curl -sf 'http://127.0.0.1:8025/api/v1/message/${m.ID}'`)) as { Text: string };
      const token = /\/login\/verify\/([A-Za-z0-9_-]+)/.exec(msg.Text)?.[1];
      if (token) return token;
    }
    await sleep(1000);
  }
  throw new Error(`no verification mail for ${email}`);
}

/** Replace restrict_server_creation with these IDs and restart api. */
export async function setServerCreators(ids: string[]): Promise<void> {
  await ssh(`${REMOTE_DIR}/set-server-creators.sh ${ids.map(q).join(' ')}`);
}

/** Wipe all Stoat data. Refuses on the VPS unless .allow-wipe exists. */
export async function resetData(): Promise<void> {
  await ssh(`${REMOTE_DIR}/reset-data.sh`, 900_000);
}

/** Count accounts, so the seed never builds on top of an existing database by accident. */
export async function accountCount(): Promise<number> {
  const out = await ssh(
    `cd ~/stoat && concord/dc exec -T database mongosh --quiet revolt --eval 'print(db.accounts.countDocuments())'`,
  );
  const n = Number(out.trim());
  if (out.trim() === '' || !Number.isInteger(n)) throw new Error(`could not count accounts: ${out.trim().slice(0, 200)}`);
  return n;
}
