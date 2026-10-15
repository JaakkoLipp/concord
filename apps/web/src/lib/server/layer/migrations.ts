/** The store's migrations: migrations/NNN-name.sql, bundled into the build. */
import { migrationsFrom } from './store.ts';

export const MIGRATIONS = migrationsFrom(import.meta.glob<string>('./migrations/*.sql', { query: '?raw', import: 'default', eager: true }));
