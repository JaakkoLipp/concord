/**
 * Server folders on the rail (M4.8 task 10b), synced as `concord:folders`: `{folders: [{id, name, color?, servers}]}`.
 * The rail's order stays Stoat's `ordering`; a folder shows at the place of its first server there, holding its
 * servers in its own order. Pure: every edit takes the rail as shown and returns the rail to show and write.
 *
 * Folders are read against the servers the account is in: a server it has left drops out, and a folder left with
 * fewer than two servers dissolves. That happens only when the rail is read; nothing is written back until the
 * user changes the rail, so a moment before the server list arrives can't empty anyone's folders.
 */
import type { Id } from './entities.ts';

export const FOLDERS_KEY = 'concord:folders';
/** Caps on what is read, since any device may have written the setting. */
export const FOLDERS_MAX = 100;
export const FOLDER_SERVERS_MAX = 200;
export const FOLDER_NAME_MAX = 32;

export interface Folder {
  id: string;
  /** May be empty: the rail then names the folder by its servers. */
  name: string;
  /** Kept as written, `#rrggbb`. Nothing in Concord sets it yet. */
  color?: string;
  servers: Id[];
}

export type RailItem = { kind: 'server'; id: Id } | { kind: 'folder'; folder: Folder };

const ID = /^[0-9A-Za-z_-]{1,64}$/;
const COLOR = /^#[0-9a-f]{6}$/i;

/** The stored folders, tolerating bad data: malformed folders go, and a server is in at most one folder. */
export function parseFolders(raw: string | undefined): Folder[] {
  let list: unknown;
  try {
    list = (JSON.parse(raw ?? '{}') as { folders?: unknown } | null)?.folders;
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  const ids = new Set<string>();
  const seen = new Set<Id>();
  const out: Folder[] = [];
  for (const f of list.slice(0, FOLDERS_MAX) as Partial<Folder>[]) {
    if (!f || typeof f !== 'object' || typeof f.id !== 'string' || !ID.test(f.id) || ids.has(f.id) || !Array.isArray(f.servers)) continue;
    ids.add(f.id);
    const servers = [...new Set(f.servers.filter((s): s is string => typeof s === 'string' && ID.test(s) && !seen.has(s)))].slice(0, FOLDER_SERVERS_MAX);
    for (const s of servers) seen.add(s);
    out.push({
      id: f.id,
      name: typeof f.name === 'string' ? f.name.slice(0, FOLDER_NAME_MAX) : '',
      ...(typeof f.color === 'string' && COLOR.test(f.color) ? { color: f.color } : {}),
      servers,
    });
  }
  return out;
}

export const writeFolders = (folders: readonly Folder[]): string => JSON.stringify({ folders });

/**
 * The rail as shown: `order` (the servers present, in rail order) with each folder in place of its first server
 * there. A folder keeps only servers in `order`, and with fewer than two it isn't one.
 */
export function railItems(order: readonly Id[], folders: readonly Folder[]): RailItem[] {
  const present = new Set(order);
  const live = folders.map((f) => ({ ...f, servers: f.servers.filter((s) => present.has(s)) })).filter((f) => f.servers.length >= 2);
  const folderOf = new Map<Id, Folder>();
  for (const f of live) for (const s of f.servers) folderOf.set(s, f);
  const items: RailItem[] = [];
  const placed = new Set<string>();
  for (const id of order) {
    const f = folderOf.get(id);
    if (!f) items.push({ kind: 'server', id });
    else if (!placed.has(f.id)) {
      placed.add(f.id);
      items.push({ kind: 'folder', folder: f });
    }
  }
  return items;
}

/** The servers in rail order, each folder's together: what `ordering` should hold. */
export const flatten = (items: readonly RailItem[]): Id[] => items.flatMap((i) => (i.kind === 'server' ? [i.id] : i.folder.servers));

/** The folders to store: those on the rail, as it holds them. */
export const foldersOf = (items: readonly RailItem[]): Folder[] => items.flatMap((i) => (i.kind === 'folder' ? [i.folder] : []));

const copy = (items: readonly RailItem[]): RailItem[] => items.map((i) => (i.kind === 'folder' ? { kind: 'folder', folder: { ...i.folder, servers: [...i.folder.servers] } } : i));

/** A folder left with fewer than two servers gives way to its server, in its place. */
function dissolve(items: RailItem[]): RailItem[] {
  return items.flatMap((i): RailItem[] => (i.kind === 'folder' && i.folder.servers.length < 2 ? i.folder.servers.map((id) => ({ kind: 'server', id })) : [i]));
}

/** Takes a server out of wherever it is, leaving any folder it was in in place, if only for now. */
function take(items: RailItem[], server: Id): RailItem[] {
  return items.filter((i) => !(i.kind === 'server' && i.id === server)).map((i) => {
    if (i.kind === 'folder') i.folder.servers = i.folder.servers.filter((s) => s !== server);
    return i;
  });
}

/** Where a dragged server or folder lands between tiles: in a folder, or on the rail itself, before index `at`. */
export type Gap = { folder: string | null; at: number };
export type Dragged = { kind: 'server'; id: Id } | { kind: 'folder'; id: string };

/**
 * A drop between tiles. `at` counts the tiles before the gap with the dragged one left out: the rail's items,
 * or a folder's servers. A folder lands only on the rail itself. A server leaving a folder may dissolve it.
 */
export function dropInGap(items: readonly RailItem[], dragged: Dragged, gap: Gap): RailItem[] {
  let next = copy(items);
  if (dragged.kind === 'folder') {
    if (gap.folder !== null) return copy(items);
    const i = next.findIndex((x) => x.kind === 'folder' && x.folder.id === dragged.id);
    if (i < 0) return copy(items);
    const [f] = next.splice(i, 1);
    next.splice(Math.min(gap.at, next.length), 0, f!);
    return next;
  }
  // Counted with the dragged server left out, but with its folder still there: it dissolves after the insert.
  next = take(next, dragged.id);
  const into = gap.folder === null ? null : next.find((x): x is Extract<RailItem, { kind: 'folder' }> => x.kind === 'folder' && x.folder.id === gap.folder);
  if (into) into.folder.servers.splice(Math.min(gap.at, into.folder.servers.length), 0, dragged.id);
  else next.splice(Math.min(gap.at, next.length), 0, { kind: 'server', id: dragged.id });
  return dissolve(next);
}

/**
 * A server dropped on another tile: on a folder, or a server in one, it joins that folder at the end; on a server
 * in none, the two make a new folder (`id`) where the target was.
 */
export function dropOnto(items: readonly RailItem[], server: Id, target: { kind: 'server'; id: Id } | { kind: 'folder'; id: string }, id: string): RailItem[] {
  if (target.kind === 'server' && target.id === server) return copy(items);
  const next = take(copy(items), server);
  const folder = next.find((x): x is Extract<RailItem, { kind: 'folder' }> => x.kind === 'folder'
    && (target.kind === 'folder' ? x.folder.id === target.id : x.folder.servers.includes(target.id)));
  if (folder) folder.folder.servers.push(server);
  else {
    const i = next.findIndex((x) => x.kind === 'server' && x.id === target.id);
    if (i < 0) return copy(items);
    next[i] = { kind: 'folder', folder: { id, name: '', servers: [target.id, server] } };
  }
  return dissolve(next);
}

/** A new folder from the menu: `servers` in rail order, at the place of the first of them. */
export function makeFolder(items: readonly RailItem[], servers: readonly Id[], id: string, name: string): RailItem[] {
  const chosen = flatten(items).filter((s) => servers.includes(s));
  if (chosen.length < 2) return copy(items);
  // The first chosen server's place, as a tile on the rail: its own, or its folder's.
  const firstAt = items.findIndex((x) => (x.kind === 'server' ? x.id === chosen[0] : x.folder.servers.includes(chosen[0]!)));
  let next = copy(items);
  // The new folder goes in first, so its place holds while the chosen servers leave theirs.
  const made: Folder = { id, name: name.trim().slice(0, FOLDER_NAME_MAX), servers: [] };
  next.splice(firstAt, 0, { kind: 'folder', folder: made });
  for (const s of chosen) next = take(next, s);
  made.servers = chosen;
  return dissolve(next);
}

/** Out of its folder, onto the rail just after the folder. */
export function removeFromFolder(items: readonly RailItem[], server: Id): RailItem[] {
  const i = items.findIndex((x) => x.kind === 'folder' && x.folder.servers.includes(server));
  if (i < 0) return copy(items);
  const next = take(copy(items), server);
  next.splice(i + 1, 0, { kind: 'server', id: server });
  return dissolve(next);
}

/** The folder goes, its servers stay in its place. */
export function removeFolder(items: readonly RailItem[], folder: string): RailItem[] {
  return copy(items).flatMap((x): RailItem[] => (x.kind === 'folder' && x.folder.id === folder ? x.folder.servers.map((id) => ({ kind: 'server', id })) : [x]));
}

export function renameFolder(items: readonly RailItem[], folder: string, name: string): RailItem[] {
  return copy(items).map((x) => (x.kind === 'folder' && x.folder.id === folder ? { kind: 'folder', folder: { ...x.folder, name: name.trim().slice(0, FOLDER_NAME_MAX) } } : x));
}

/**
 * Move up or down: a folder or a server outside one steps past the rail tile next to it; a server in a folder
 * steps within it. Null at an end.
 */
export function moveOnRail(items: readonly RailItem[], what: Dragged, delta: -1 | 1): RailItem[] | null {
  const holder = what.kind === 'server' ? items.find((x) => x.kind === 'folder' && x.folder.servers.includes(what.id)) : undefined;
  if (holder?.kind === 'folder') {
    const list = holder.folder.servers;
    const j = list.indexOf(what.id) + delta;
    if (j < 0 || j >= list.length) return null;
    return dropInGap(items, what, { folder: holder.folder.id, at: j });
  }
  const i = items.findIndex((x) => (what.kind === 'server' ? x.kind === 'server' && x.id === what.id : x.kind === 'folder' && x.folder.id === what.id));
  const j = i + delta;
  if (i < 0 || j < 0 || j >= items.length) return null;
  return dropInGap(items, what, { folder: null, at: j });
}
