/**
 * Server invites on request: a member asks for one, an admin approves, and moderators skip the queue. The layer
 * never calls Stoat for this: the approving person's client makes the invite as themselves and hands over its code,
 * so only someone who may invite in that server can approve. Stoat's invites are reusable until revoked.
 */
import { randomUUID } from 'node:crypto';
import { Permission, type ServerInviteRequest } from '@concord/domain';
import { requireId, requireText } from './input.ts';
import type { Caller, Layer } from './layer.ts';
import { LayerError } from './util.ts';

const fields = 'id, requested_by AS requestedBy, server, note, created_at AS createdAt, status, code';

function requireCode(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9]{1,32}$/.test(value)) throw new LayerError(400, 'InvalidInvite');
  return value;
}

function row(layer: Layer, id: string): ServerInviteRequest {
  const value = layer.store.prepare(`SELECT ${fields} FROM server_invites WHERE id = ?`).get(id) as unknown as ServerInviteRequest | undefined;
  if (!value) throw new LayerError(404, 'NotFound');
  return value;
}

/** Your own requests, with their codes once approved; an admin's review sees everyone's. */
export function listServerInvites(layer: Layer, caller: Caller, review: boolean): ServerInviteRequest[] {
  if (review) layer.requireAdmin(caller);
  const sql = `SELECT ${fields} FROM server_invites ${review ? '' : 'WHERE requested_by = ?'} ORDER BY created_at DESC LIMIT 200`;
  return layer.store.prepare(sql).all(...(review ? [] : [caller.id])) as unknown as ServerInviteRequest[];
}

/** A moderator or admin may attach an invite code they just made, and so skip review. */
export async function requestServerInvite(layer: Layer, caller: Caller, serverInput: unknown, noteInput: unknown, codeInput?: unknown): Promise<ServerInviteRequest> {
  const server = requireId(serverInput, 'server');
  const note = requireText(noteInput, { max: 80, min: 0, field: 'note' });
  if ((await layer.serverPermissions(caller, server)) === 0n) throw new LayerError(403, 'MissingPermission', { permission: 'Member' });
  const gates = await layer.gates(caller);
  const direct = codeInput !== undefined && codeInput !== null;
  if (direct) {
    if (!gates.admin && !gates.serverCreator) throw new LayerError(403, 'NotServerCreator');
    await layer.requirePermission(caller, server, Permission.InviteOthers, 'InviteOthers');
  }
  const code = direct ? requireCode(codeInput) : null;
  const now = Date.now();
  const count = layer.store.prepare('SELECT count(*) AS n FROM server_invites WHERE requested_by = ? AND created_at > ?').get(caller.id, now - 24 * 60 * 60_000) as { n: number };
  if (count.n >= 10) throw new LayerError(429, 'InvitationLimit');
  const id = randomUUID();
  layer.store.prepare('INSERT INTO server_invites (id, requested_by, server, note, created_at, status, reviewed_by, code) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, caller.id, server, note, now, direct ? 'approved' : 'pending', direct ? caller.id : null, code);
  return row(layer, id);
}

/** Admin only. Approving takes the code of an invite the admin just made in that server. */
export async function reviewServerInvite(layer: Layer, caller: Caller, id: string, approve: boolean, codeInput?: unknown): Promise<void> {
  layer.requireAdmin(caller);
  const invite = row(layer, id);
  let code: string | null = null;
  if (approve) {
    code = requireCode(codeInput);
    await layer.requirePermission(caller, invite.server, Permission.InviteOthers, 'InviteOthers');
  }
  const result = layer.store.prepare("UPDATE server_invites SET status = ?, reviewed_by = ?, code = ? WHERE id = ? AND status = 'pending'")
    .run(approve ? 'approved' : 'declined', caller.id, code, id);
  if (!result.changes) throw new LayerError(409, 'InvitationChanged');
}
