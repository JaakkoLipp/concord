/**
 * The admin view's account actions (architecture section 11.5). The layer holds no root and no Docker, so it only
 * asks: a request is one small file in the spool's `in` folder, and the account runner on the host (deploy/account-
 * runner.py) checks it again, does the one thing, and answers in `out`, which this process can only read. Every rule
 * the runner enforces is checked here first too, but the runner never relies on that.
 */
import { randomUUID } from 'node:crypto';
import { closeSync, openSync, readFileSync, readdirSync, renameSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import type { AccountAction, AccountActionResult, PlatformUser } from '@concord/domain';
import { requireId } from './input.ts';
import type { Caller, Layer } from './layer.ts';
import { LayerError } from './util.ts';

export const ACTIONS: readonly AccountAction[] = ['moderator:add', 'moderator:remove', 'admin:add', 'admin:remove', 'password-link', 'suspend', 'unsuspend'];
/** How long the runner's user list may be before we say it isn't running: it refreshes every 30 s. */
const STALE_MS = 3 * 60_000;
const MAX_WAITING = 20;
const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function spool(layer: Layer): { in: string; out: string } {
  const dir = layer.config.spoolDir;
  if (!dir) throw new LayerError(503, 'RunnerUnavailable');
  return { in: join(dir, 'in'), out: join(dir, 'out') };
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/** Everyone on the platform, as the runner last saw them, with our two global roles. Admin only. */
export async function platformUsers(layer: Layer, caller: Caller): Promise<{ users: PlatformUser[]; updatedAt: number }> {
  layer.requireAdmin(caller);
  const folders = spool(layer);
  const file = readJson(join(folders.out, 'users.json')) as { updatedAt?: number; users?: Omit<PlatformUser, 'admin' | 'moderator' | 'owner'>[] } | null;
  if (!file?.users || typeof file.updatedAt !== 'number' || Date.now() - file.updatedAt > STALE_MS) throw new LayerError(503, 'RunnerUnavailable');
  const admins = [...layer.config.adminIds];
  const moderators = new Set(await layer.moderators());
  const users = file.users.map((u) => ({ ...u, admin: admins.includes(u.id), moderator: moderators.has(u.id), owner: admins[0] === u.id }));
  return { users, updatedAt: file.updatedAt };
}

/** Ask the runner. Returns the request's ID to ask about. */
export function requestAccountAction(layer: Layer, caller: Caller, actionInput: unknown, userInput: unknown): { id: string } {
  layer.requireAdmin(caller);
  const action = ACTIONS.find((a) => a === actionInput);
  if (!action) throw new LayerError(400, 'InvalidAction');
  const user = requireId(userInput, 'user');
  const folders = spool(layer);
  let waiting: number;
  try {
    waiting = readdirSync(folders.in).length;
  } catch {
    throw new LayerError(503, 'RunnerUnavailable');
  }
  if (waiting >= MAX_WAITING) throw new LayerError(429, 'RunnerBusy');
  const id = randomUUID();
  // Written whole under a name the runner ignores, then renamed, so it never reads half a request.
  const tmp = join(folders.in, `.${id}.tmp`);
  const fd = openSync(tmp, 'wx', 0o600);
  try {
    writeSync(fd, JSON.stringify({ action, user, by: caller.id }));
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, join(folders.in, `${id}.req.json`));
  return { id };
}

/** The runner's answer to a request, for whoever asked: pending until it has one. */
export function accountActionResult(layer: Layer, caller: Caller, id: string): AccountActionResult {
  layer.requireAdmin(caller);
  if (!REQUEST_ID.test(id)) throw new LayerError(400, 'InvalidId', { field: 'id' });
  const folders = spool(layer);
  const result = readJson(join(folders.out, `${id}.res.json`)) as { by?: string; action?: string; status?: string; message?: string; link?: string } | null;
  if (!result) return { status: 'pending' };
  if (result.by !== undefined && result.by !== caller.id) throw new LayerError(404, 'NotFound');
  if (result.status !== 'ok' && result.status !== 'failed') return { status: 'pending' };
  // The list of moderators is cached for a minute: after a change, the next read must see it.
  if (result.status === 'ok' && result.action?.startsWith('moderator:')) layer.forgetModerators();
  return { status: result.status, message: String(result.message ?? ''), ...(result.link ? { link: result.link } : {}) };
}
