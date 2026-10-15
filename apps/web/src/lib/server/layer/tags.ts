/**
 * Server tags (m4.5-plan.md task 10, architecture section 11.4): a server's tag of up to 4 letters or digits
 * with one of its custom emoji as the badge, and which tag each user wears. Clients show a worn tag only for
 * people in that server's member list as they know it, so the store never needs to check membership on reads.
 */
import type { DatabaseSync } from 'node:sqlite';
import { requireText } from './input.ts';
import { LayerError } from './util.ts';

export interface ServerTag { server: string; tag: string; emoji: string }

/** Letters and digits only, up to 4 of them, so a tag reads as a tag and can't carry junk. */
export function requireTag(value: unknown): string {
  const tag = requireText(value, { max: 4, field: 'tag' });
  if (!/^[\p{L}\p{N}]+$/u.test(tag)) throw new LayerError(400, 'InvalidText', { field: 'tag', min: 1, max: 4 });
  return tag;
}

const now = () => new Date().toISOString();
type Row = { server: string; tag: string; emoji: string };

export function serverTags(db: DatabaseSync, servers: string[]): Record<string, ServerTag> {
  if (!servers.length) return {};
  const rows = db.prepare(`SELECT server, tag, emoji FROM server_tags WHERE server IN (${servers.map(() => '?').join(',')})`).all(...servers) as Row[];
  return Object.fromEntries(rows.map((r) => [r.server, { server: r.server, tag: r.tag, emoji: r.emoji }]));
}

/** The tags these users wear, with their server's tag and badge. */
export function wornTags(db: DatabaseSync, users: string[]): Record<string, ServerTag> {
  if (!users.length) return {};
  const rows = db.prepare(`SELECT w.user, t.server, t.tag, t.emoji FROM worn_tags w JOIN server_tags t ON t.server = w.server
    WHERE w.user IN (${users.map(() => '?').join(',')})`).all(...users) as (Row & { user: string })[];
  return Object.fromEntries(rows.map((r) => [r.user, { server: r.server, tag: r.tag, emoji: r.emoji }]));
}

export function setServerTag(db: DatabaseSync, t: ServerTag, by: string): ServerTag {
  db.prepare(`INSERT INTO server_tags (server, tag, emoji, updated_by, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (server) DO UPDATE SET tag = excluded.tag, emoji = excluded.emoji, updated_by = excluded.updated_by, updated_at = excluded.updated_at`)
    .run(t.server, t.tag, t.emoji, by, now());
  return t;
}

/** Disables a server's tag, which takes it off everyone wearing it. */
export function removeServerTag(db: DatabaseSync, server: string): void {
  db.prepare('DELETE FROM server_tags WHERE server = ?').run(server);
}

export function wear(db: DatabaseSync, user: string, server: string | null): void {
  if (server === null) {
    db.prepare('DELETE FROM worn_tags WHERE user = ?').run(user);
    return;
  }
  db.prepare(`INSERT INTO worn_tags (user, server, updated_at) VALUES (?, ?, ?)
    ON CONFLICT (user) DO UPDATE SET server = excluded.server, updated_at = excluded.updated_at`).run(user, server, now());
}
