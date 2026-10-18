import { randomUUID } from 'node:crypto';
import type { Feedback } from '@concord/domain';
import type { Caller, Layer } from './layer.ts';
import { requireText } from './input.ts';
import { LayerError } from './util.ts';

/** Any signed-in member can send feedback; only admins can read or close it. */
export function submitFeedback(layer: Layer, caller: Caller, input: { kind?: unknown; title?: unknown; description?: unknown }): { id: string } {
  if (input.kind !== 'bug' && input.kind !== 'feedback') throw new LayerError(400, 'InvalidKind');
  const title = requireText(input.title, { max: 120, field: 'title' });
  if (typeof input.description !== 'string') throw new LayerError(400, 'InvalidText', { field: 'description' });
  // Permit paragraphs for reproduction steps while checking all other controls as usual.
  const description = input.description.normalize('NFC').replace(/\r\n?/g, '\n').trim();
  requireText(description.replace(/\n/g, ' '), { max: 4_000, field: 'description' });
  const now = Date.now();
  const recent = layer.store.prepare('SELECT count(*) AS n FROM feedback WHERE reporter = ? AND created_at > ?')
    .get(caller.id, now - 60 * 60_000) as { n: number };
  if (recent.n >= 10) throw new LayerError(429, 'FeedbackLimit', { retry_after: 60 * 60_000 });
  const id = randomUUID();
  layer.store.prepare("INSERT INTO feedback (id, reporter, kind, title, description, created_at, status) VALUES (?, ?, ?, ?, ?, ?, 'open')")
    .run(id, caller.id, input.kind, title, description, now);
  return { id };
}

export function listFeedback(layer: Layer, caller: Caller, includeClosed: boolean): Feedback[] {
  layer.requireAdmin(caller);
  return layer.store.prepare(`SELECT id, reporter, kind, title, description, created_at AS createdAt, status,
    closed_by AS closedBy, closed_at AS closedAt FROM feedback ${includeClosed ? '' : "WHERE status = 'open'"}
    ORDER BY status = 'closed', created_at DESC LIMIT 200`).all() as unknown as Feedback[];
}

export function closeFeedback(layer: Layer, caller: Caller, id: string): void {
  layer.requireAdmin(caller);
  const row = layer.store.prepare('SELECT status FROM feedback WHERE id = ?').get(id) as { status: string } | undefined;
  if (!row) throw new LayerError(404, 'NotFound');
  if (row.status === 'closed') throw new LayerError(409, 'FeedbackClosed');
  layer.store.prepare("UPDATE feedback SET status = 'closed', closed_by = ?, closed_at = ? WHERE id = ?")
    .run(caller.id, Date.now(), id);
}
