/**
 * The layer's store (architecture section 11.2): one SQLite file through Node's built-in node:sqlite, in WAL
 * mode with a busy timeout. Numbered migrations run at start, after the file is copied aside. A database newer
 * than this build knows is refused, so a rollback can't damage data.
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';

export interface Migration {
  /** 1, 2, 3 and so on, with no gaps: the file's number. */
  version: number;
  name: string;
  sql: string;
}

export class NewerDatabaseError extends Error {}

/** Migrations from files named like `001-meta.sql`, as `import.meta.glob` returns them. */
export function migrationsFrom(files: Record<string, string>): Migration[] {
  const list = Object.entries(files).map(([path, sql]) => {
    const m = /(\d+)-([\w-]+)\.sql$/.exec(path);
    if (!m) throw new Error(`migration file name not numbered: ${path}`);
    return { version: Number(m[1]), name: m[2]!, sql };
  });
  list.sort((a, b) => a.version - b.version);
  list.forEach((m, i) => {
    if (m.version !== i + 1) throw new Error(`migrations must be numbered 1, 2, 3 without gaps: found ${m.version} at ${i + 1}`);
  });
  return list;
}

/** The copy taken before migrating from `version`, next to the database. */
export const copyBefore = (path: string, version: number) => `${path}.before-v${version + 1}`;

/**
 * Opens the store, migrating it to the newest version. `path` is a file, or ':memory:' for tests.
 * Throws NewerDatabaseError when the file is newer than these migrations.
 */
export function openStore(path: string, migrations: Migration[], log: (line: string) => void = () => {}): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  try {
    db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;');
    const current = Number((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version);
    const target = migrations.length;
    if (current > target) {
      throw new NewerDatabaseError(`the store is at version ${current}, newer than this build's ${target}: refusing to start`);
    }
    if (current === target) return db;
    if (current > 0 && path !== ':memory:') {
      const copy = copyBefore(path, current);
      if (existsSync(copy)) rmSync(copy);
      db.exec(`VACUUM INTO '${copy.replaceAll("'", "''")}'`);
      log(`store: copied version ${current} to ${copy}`);
    }
    for (const m of migrations.slice(current)) {
      db.exec('BEGIN IMMEDIATE');
      try {
        // Another process starting at the same moment may have applied it already.
        if (Number((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version) >= m.version) {
          db.exec('ROLLBACK');
          continue;
        }
        db.exec(m.sql);
        db.exec(`PRAGMA user_version = ${m.version}`);
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
      log(`store: migrated to version ${m.version} (${m.name})`);
    }
    return db;
  } catch (e) {
    db.close();
    throw e;
  }
}
