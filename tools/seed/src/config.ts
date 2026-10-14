import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SEED_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
/** The stack the seed talks to: the dev stack unless CONCORD_HOST says otherwise (tools/target.ts). */
import { BACKEND } from '../../target.ts';
export { BACKEND, SSH as SSH_TARGET } from '../../target.ts';
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
  if (!existsSync(STATE_FILE)) return null;
  const state = JSON.parse(readFileSync(STATE_FILE, 'utf8')) as SeedState;
  // Persona IDs from another stack would send the checks to the wrong accounts, or to none.
  if (state.backend !== BACKEND) throw new Error(`${STATE_FILE} was seeded on ${state.backend}, not ${BACKEND}. Run pnpm seed --reset first.`);
  return state;
}

export function saveState(state: SeedState): void {
  mkdirSync(SEED_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
}
