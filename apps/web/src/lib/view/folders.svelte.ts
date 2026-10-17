/**
 * The rail's folders on this device (M4.8 task 10b): which are open, under `concord:open-folders`, and the one
 * folder dialog (create or rename). The folders themselves are synced, in the store; see packages/domain's
 * folders.ts. Storage is a convenience: every access is wrapped.
 */
import type { Id } from '@concord/domain';

const KEY = 'concord:open-folders';
/** Folder IDs kept open at most. */
const OPEN_MAX = 100;

function read(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(-OPEN_MAX) : [];
  } catch {
    return [];
  }
}

class OpenFolders {
  #open = $state<string[]>(typeof localStorage === 'undefined' ? [] : read());

  is(folder: string): boolean {
    return this.#open.includes(folder);
  }

  toggle(folder: string): void {
    this.#open = this.is(folder) ? this.#open.filter((f) => f !== folder) : [...this.#open, folder].slice(-OPEN_MAX);
    try {
      localStorage.setItem(KEY, JSON.stringify(this.#open));
    } catch {
      // Storage blocked; open for this tab only.
    }
  }
}

export const openFolders = new OpenFolders();

/** The folder dialog: a new folder, starting with a server, or a new name for one. */
export type FolderDialog = { kind: 'create'; server: Id } | { kind: 'rename'; folder: string };

class FolderDialogs {
  current = $state<FolderDialog | null>(null);
  open(d: FolderDialog): void {
    this.current = d;
  }
  close(): void {
    this.current = null;
  }
}

export const folderDialog = new FolderDialogs();
