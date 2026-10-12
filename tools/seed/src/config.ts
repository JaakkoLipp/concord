import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SEED_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
export const BACKEND = process.env.CONCORD_BACKEND ?? 'https://concord.jaalip.com';
/** SSH destination for the VPS: Jaakko's login through the public hostname, so no address is written down. */
export const SSH_TARGET = process.env.CONCORD_SSH ?? 'jaakko@concord.jaalip.com';
/** Where the stack lives on the VPS. */
export const REMOTE_DIR = '~/stoat/concord';

const SECRET_FILE = join(SEED_DIR, '.seed-secret');
const STATE_FILE = join(SEED_DIR, '.state.json');

/**
 * SEED_SECRET derives every persona password. Never committed. Only a seed run may create it: anywhere else a
 * missing file would silently produce passwords that match no account.
 */
export function seedSecret(create = false): string {
  if (!existsSync(SECRET_FILE)) {
    if (!create) throw new Error(`${SECRET_FILE} is missing; the seeded accounts can't be used without it. Run pnpm seed --reset.`);
    writeFileSync(SECRET_FILE, randomBytes(32).toString('base64url') + '\n', { mode: 0o600 });
  }
  return readFileSync(SECRET_FILE, 'utf8').trim();
}

export interface PersonaState {
  handle: string;
  email: string;
  userId: string;
  username: string;
  totpSecret?: string;
  botToken?: string;
}

/** IDs from the last seed run, read by `seed hold`, `seed account` and the fixture recorder. Gitignored. */
export interface SeedState {
  backend: string;
  seededAt: string;
  emailDomain: string;
  serverId: string;
  inviteCode: string;
  channels: Record<string, string>;
  roles: Record<string, string>;
  emoji: Record<string, string>;
  groupId: string;
  personas: Record<string, PersonaState>;
}

export function loadState(): SeedState | null {
  return existsSync(STATE_FILE) ? (JSON.parse(readFileSync(STATE_FILE, 'utf8')) as SeedState) : null;
}

export function saveState(state: SeedState): void {
  mkdirSync(SEED_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
}
