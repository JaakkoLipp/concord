/** Closed beta access: requests need an admin unless the requester is a Concord moderator. */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { BetaInvitation } from '@concord/domain';
import type { Caller, Layer } from './layer.ts';
import { LayerError } from './util.ts';

const WEEK = 7 * 24 * 60 * 60_000;
const fields = 'id, email, requested_by AS requestedBy, created_at AS createdAt, status, expires_at AS expiresAt';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const invalid = () => new LayerError(400, 'InvalidInvitation');

export function emailAddress(value: unknown): string {
  if (typeof value !== 'string') throw new LayerError(400, 'InvalidEmail');
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || /[\x00-\x1f\x7f]/.test(email)) throw new LayerError(400, 'InvalidEmail');
  return email;
}

function row(layer: Layer, id: string): BetaInvitation {
  const value = layer.store.prepare(`SELECT ${fields} FROM beta_invitations WHERE id = ?`).get(id) as unknown as BetaInvitation | undefined;
  if (!value) throw new LayerError(404, 'NotFound');
  return value;
}

export function listInvitations(layer: Layer, caller: Caller, review: boolean): BetaInvitation[] {
  if (review) layer.requireAdmin(caller);
  const sql = `SELECT ${fields} FROM beta_invitations ${review ? '' : 'WHERE requested_by = ?'} ORDER BY created_at DESC LIMIT 200`;
  return layer.store.prepare(sql).all(...(review ? [] : [caller.id])) as unknown as BetaInvitation[];
}

export async function requestInvitation(layer: Layer, caller: Caller, input: unknown): Promise<BetaInvitation> {
  const email = emailAddress(input);
  const gates = await layer.gates(caller);
  const now = Date.now();
  // Expired approvals no longer reserve an address.
  layer.store.prepare("UPDATE beta_invitations SET status = 'declined', token_hash = NULL WHERE status = 'approved' AND expires_at <= ?").run(now);
  const count = layer.store.prepare('SELECT count(*) AS n FROM beta_invitations WHERE requested_by = ? AND created_at > ?').get(caller.id, now - 24 * 60 * 60_000) as { n: number };
  if (count.n >= 10) throw new LayerError(429, 'InvitationLimit');
  if (layer.store.prepare("SELECT id FROM beta_invitations WHERE email = ? AND status IN ('pending', 'approved', 'claiming')").get(email)) throw new LayerError(409, 'InvitationPending');
  const id = randomUUID();
  const direct = gates.admin || gates.serverCreator;
  layer.store.prepare('INSERT INTO beta_invitations (id, email, requested_by, created_at, status, reviewed_by, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, email, caller.id, now, direct ? 'approved' : 'pending', direct ? caller.id : null, direct ? now + WEEK : null);
  return row(layer, id);
}

export function reviewInvitation(layer: Layer, caller: Caller, id: string, approve: boolean): void {
  layer.requireAdmin(caller);
  const result = layer.store.prepare("UPDATE beta_invitations SET status = ?, reviewed_by = ?, expires_at = ?, token_hash = NULL WHERE id = ? AND status = 'pending'")
    .run(approve ? 'approved' : 'declined', caller.id, approve ? Date.now() + WEEK : null, id);
  if (!result.changes) throw new LayerError(409, 'InvitationChanged');
}

/** Tokens are only returned to the requester or an admin; a new link invalidates the old one. */
export function invitationLink(layer: Layer, caller: Caller, id: string): string {
  const invite = row(layer, id);
  if (invite.requestedBy !== caller.id) layer.requireAdmin(caller);
  if (invite.status !== 'approved' || !invite.expiresAt || invite.expiresAt <= Date.now()) throw invalid();
  const token = randomBytes(32).toString('base64url');
  layer.store.prepare("UPDATE beta_invitations SET token_hash = ? WHERE id = ? AND status = 'approved'").run(hash(token), id);
  return token;
}

export async function redeemInvitation(layer: Layer, token: unknown, emailInput: unknown, password: unknown): Promise<void> {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw invalid();
  const email = emailAddress(emailInput);
  if (typeof password !== 'string' || password.length < 8 || password.length > 1024) throw new LayerError(400, 'ShortPassword');
  // Claim before any await: concurrent submissions cannot create multiple accounts.
  const claimed = layer.store.prepare("UPDATE beta_invitations SET status = 'claiming' WHERE token_hash = ? AND email = ? AND status = 'approved' AND expires_at > ? RETURNING id")
    .get(hash(token), email, Date.now()) as { id: string } | undefined;
  if (!claimed) throw invalid();
  try {
    await layer.stoat.createBetaAccount(email, password);
    layer.store.prepare("UPDATE beta_invitations SET status = 'used', token_hash = NULL WHERE id = ?").run(claimed.id);
  } catch (error) {
    // A network failure may have created the account. Fail closed; never reset an existing account.
    const retryable = error instanceof LayerError && ['ShortPassword', 'CompromisedPassword', 'InvalidEmail', 'RateLimited'].includes(error.type);
    layer.store.prepare('UPDATE beta_invitations SET status = ?, token_hash = CASE WHEN ? THEN token_hash ELSE NULL END WHERE id = ?')
      .run(retryable ? 'approved' : 'failed', retryable ? 1 : 0, claimed.id);
    throw error;
  }
}

