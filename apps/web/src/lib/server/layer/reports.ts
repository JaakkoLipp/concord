/**
 * Reports (m4.7-plan.md task 9). Stoat's own reports reach no one, so the layer keeps them. A report of a message in a
 * server channel goes to that server's moderators, those with Manage messages; a report of a DM or group message, or of
 * a user, goes to the app's admins on ADMIN_USER_IDS. The layer reads the message from Stoat as the reporter, so only
 * what they can see can be reported, and keeps a copy of its text as evidence, dropped 90 days after the report closes.
 * The reporter is never shown to the person reported, and each person may file 10 reports an hour.
 */
import { randomUUID } from 'node:crypto';
import { Permission, type Report, type ReportReason, type ReportScope } from '@concord/domain';
import { requireId, requireText } from './input.ts';
import type { Caller, Layer } from './layer.ts';
import { LayerError } from './util.ts';

export const REPORT_REASONS: ReportReason[] = ['spam', 'harassment', 'hate', 'sexual', 'violence', 'other'];
export const REPORTS_PER_HOUR = 10;
export const EVIDENCE_KEPT_MS = 90 * 24 * 60 * 60_000;
/** Longer than Stoat's 2,000 characters, so a message's text is kept whole. */
const MAX_CONTENT = 4_000;

const fields = `id, kind, server, channel, message, reported, content, reason, notes, created_at AS createdAt, status, reporter,
  closed_by AS closedBy, closed_at AS closedAt, close_note AS closeNote`;

/** `?scope=admin` for the app's admins, or `?server=` for a server's moderators. */
export const scopeOf = (url: URL): ReportScope => (url.searchParams.get('scope') === 'admin' ? 'admin' : { server: url.searchParams.get('server') ?? '' });

function requireReason(value: unknown): ReportReason {
  if (!REPORT_REASONS.includes(value as ReportReason)) throw new LayerError(400, 'InvalidReason');
  return value as ReportReason;
}

/** 403 or 404 unless the caller may read reports in this scope. Admins see only their own list, not every server's. */
async function requireScope(layer: Layer, caller: Caller, scope: ReportScope): Promise<void> {
  if (scope === 'admin') return layer.requireAdmin(caller);
  await layer.requirePermission(caller, requireId(scope.server, 'server'), Permission.ManageMessages, 'ManageMessages');
}

/** Evidence past its time goes: the text of a report closed more than 90 days ago. Cheap, so run on every read. */
export function dropOldEvidence(layer: Layer, now = Date.now()): void {
  layer.store.prepare("UPDATE reports SET content = NULL WHERE status = 'closed' AND content IS NOT NULL AND closed_at < ?").run(now - EVIDENCE_KEPT_MS);
}

export interface ReportInput { kind?: unknown; channel?: unknown; message?: unknown; user?: unknown; reason?: unknown; notes?: unknown }

export async function fileReport(layer: Layer, caller: Caller, input: ReportInput): Promise<{ id: string }> {
  const reason = requireReason(input.reason);
  const notes = requireText(input.notes ?? '', { max: 500, min: 0, field: 'notes' });
  const now = Date.now();
  const recent = layer.store.prepare('SELECT count(*) AS n FROM reports WHERE reporter = ? AND created_at > ?').get(caller.id, now - 60 * 60_000) as { n: number };
  if (recent.n >= REPORTS_PER_HOUR) throw new LayerError(429, 'ReportLimit', { retry_after: 60 * 60_000 });

  let row: { kind: 'message' | 'user'; server: string | null; channel: string | null; message: string | null; reported: string; content: string | null };
  if (input.kind === 'message') {
    const channel = requireId(input.channel, 'channel');
    const message = requireId(input.message, 'message');
    // As the reporter: what they can't read, they can't report.
    const [where, found] = await Promise.all([layer.stoat.channel(caller.token, channel), layer.stoat.message(caller.token, channel, message)]);
    if (!where || !found) throw new LayerError(404, 'NotFound');
    if (found.author === caller.id) throw new LayerError(400, 'OwnMessage');
    row = { kind: 'message', server: where.server ?? null, channel, message, reported: found.author, content: found.content.slice(0, MAX_CONTENT) };
  } else if (input.kind === 'user') {
    const user = requireId(input.user, 'user');
    if (user === caller.id) throw new LayerError(400, 'OwnAccount');
    row = { kind: 'user', server: null, channel: null, message: null, reported: user, content: null };
  } else throw new LayerError(400, 'InvalidKind');

  const id = randomUUID();
  layer.store.prepare(`INSERT INTO reports (id, reporter, kind, server, channel, message, reported, content, reason, notes, created_at, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')`)
    .run(id, caller.id, row.kind, row.server, row.channel, row.message, row.reported, row.content, reason, notes, now);
  return { id };
}

const where = (scope: ReportScope) => (scope === 'admin' ? 'server IS NULL' : 'server = ?');
const params = (scope: ReportScope) => (scope === 'admin' ? [] : [scope.server]);

/** Reports in a scope, open ones first then newest. Never those about the caller, whose reporters they mustn't see. */
export async function listReports(layer: Layer, caller: Caller, scope: ReportScope, includeClosed: boolean): Promise<Report[]> {
  await requireScope(layer, caller, scope);
  dropOldEvidence(layer);
  const sql = `SELECT ${fields} FROM reports WHERE ${where(scope)} AND reported != ? ${includeClosed ? '' : "AND status = 'open'"}
    ORDER BY status = 'closed', created_at DESC LIMIT 200`;
  return layer.store.prepare(sql).all(...params(scope), caller.id) as unknown as Report[];
}

/** How many reports wait in a scope, for the count beside "Reports". */
export async function countReports(layer: Layer, caller: Caller, scope: ReportScope): Promise<number> {
  await requireScope(layer, caller, scope);
  const r = layer.store.prepare(`SELECT count(*) AS n FROM reports WHERE ${where(scope)} AND reported != ? AND status = 'open'`).get(...params(scope), caller.id) as { n: number };
  return r.n;
}

/** Close a report with a note. Closing doesn't act by itself: the moderator uses the usual actions. */
export async function closeReport(layer: Layer, caller: Caller, id: string, noteInput: unknown): Promise<void> {
  const note = requireText(noteInput ?? '', { max: 500, min: 0, field: 'note' });
  const report = layer.store.prepare('SELECT server, reported, status FROM reports WHERE id = ?').get(id) as { server: string | null; reported: string; status: string } | undefined;
  if (!report) throw new LayerError(404, 'NotFound');
  try {
    await requireScope(layer, caller, report.server ? { server: report.server } : 'admin');
  } catch (e) {
    // Someone who may not see it learns nothing about it.
    if (e instanceof LayerError && (e.status === 403 || e.status === 404)) throw new LayerError(404, 'NotFound');
    throw e;
  }
  if (report.reported === caller.id) throw new LayerError(404, 'NotFound');
  const result = layer.store.prepare("UPDATE reports SET status = 'closed', closed_by = ?, closed_at = ?, close_note = ? WHERE id = ? AND status = 'open'")
    .run(caller.id, Date.now(), note, id);
  if (!result.changes) throw new LayerError(409, 'ReportClosed');
}
