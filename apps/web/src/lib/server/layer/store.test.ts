import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { MIGRATIONS } from './migrations.ts';
import { NewerDatabaseError, copyBefore, migrationsFrom, openStore } from './store.ts';

const dirs: string[] = [];
const tempFile = () => {
  const dir = mkdtempSync(join(tmpdir(), 'layer-store-'));
  dirs.push(dir);
  return join(dir, 'layer.db');
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const version = (db: DatabaseSync) => (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
const second = { version: 2, name: 'notes', sql: 'CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL) STRICT;' };

describe('store', () => {
  it('migrates an empty file to the newest version', () => {
    const path = tempFile();
    const db = openStore(path, MIGRATIONS);
    expect(version(db)).toBe(MIGRATIONS.length);
    expect(db.prepare("SELECT value FROM meta WHERE key = 'created'").get()).toBeTruthy();
    expect((db.prepare('PRAGMA journal_mode').get() as { journal_mode: string }).journal_mode).toBe('wal');
    db.close();
    expect(existsSync(copyBefore(path, 0))).toBe(false);
  });

  it('migrates an existing file after copying it aside, keeping its rows', () => {
    const path = tempFile();
    const first = openStore(path, MIGRATIONS.slice(0, 1));
    const created = first.prepare("SELECT value FROM meta WHERE key = 'created'").get();
    first.close();

    const db = openStore(path, [...MIGRATIONS.slice(0, 1), second]);
    expect(version(db)).toBe(2);
    expect(db.prepare("SELECT value FROM meta WHERE key = 'created'").get()).toEqual(created);
    db.prepare('INSERT INTO notes (body) VALUES (?)').run('x');
    db.close();

    const copy = new DatabaseSync(copyBefore(path, 1), { readOnly: true });
    expect(version(copy)).toBe(1);
    expect(copy.prepare("SELECT value FROM meta WHERE key = 'created'").get()).toEqual(created);
    copy.close();
  });

  it('opens a file already at the newest version without copying it', () => {
    const path = tempFile();
    openStore(path, MIGRATIONS).close();
    openStore(path, MIGRATIONS).close();
    expect(existsSync(copyBefore(path, MIGRATIONS.length))).toBe(false);
  });

  it('refuses a database newer than its migrations, as after a rollback', () => {
    const path = tempFile();
    openStore(path, [...MIGRATIONS.slice(0, 1), second]).close();
    expect(() => openStore(path, MIGRATIONS.slice(0, 1))).toThrow(NewerDatabaseError);
  });

  it('rolls a failing migration back and leaves the version', () => {
    const path = tempFile();
    openStore(path, MIGRATIONS.slice(0, 1)).close();
    const broken = { version: 2, name: 'broken', sql: 'CREATE TABLE half (id INTEGER); SELECT * FROM missing;' };
    expect(() => openStore(path, [...MIGRATIONS.slice(0, 1), broken])).toThrow();
    const db = new DatabaseSync(path);
    expect(version(db)).toBe(1);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'half'").get()).toBeUndefined();
    db.close();
  });

  it('imports every migration file there is', () => {
    const files = readdirSync(join(import.meta.dirname, 'migrations')).filter((f) => f.endsWith('.sql')).sort();
    expect(MIGRATIONS.map((m) => `${String(m.version).padStart(3, '0')}-${m.name}.sql`)).toEqual(files);
  });

  it('reads numbered migration files and refuses gaps', () => {
    expect(migrationsFrom({ './migrations/002-b.sql': 'b', './migrations/001-a.sql': 'a' }).map((m) => m.name)).toEqual(['a', 'b']);
    expect(() => migrationsFrom({ './migrations/001-a.sql': 'a', './migrations/003-c.sql': 'c' })).toThrow(/without gaps/);
  });
});
