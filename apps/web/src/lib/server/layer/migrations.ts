/**
 * The store's migrations: migrations/NNN-name.sql, bundled into the build. Each is imported by name, not found by a
 * glob: Vitest's module cache kept an old glob's result after a migration was added (m4.5-results.md task 10).
 */
import { migrationsFrom } from './store.ts';
import meta from './migrations/001-meta.sql?raw';
import serverTags from './migrations/002-server-tags.sql?raw';
import betaInvitations from './migrations/003-beta-invitations.sql?raw';
import serverInvites from './migrations/004-server-invites.sql?raw';

export const MIGRATIONS = migrationsFrom({
  '001-meta.sql': meta,
  '002-server-tags.sql': serverTags,
  '003-beta-invitations.sql': betaInvitations,
  '004-server-invites.sql': serverInvites,
});
