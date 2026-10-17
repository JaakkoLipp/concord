/**
 * Channel and category ordering for the sidebar's Move items (m2c-plan.md task 3). Pure: each returns the
 * whole category list to write, as Stoat replaces it wholesale.
 *
 * Channels in no category show first, in the server's own order, which nothing can change. Every ID a
 * category holds is kept when writing, including channels this account can't see and channels deleted
 * since: Stoat drops the deleted ones itself. `visible` says which channels the sidebar shows, so a move
 * steps over the others.
 */
import type { Category, Id } from './entities.ts';

const where = (categories: Category[], channel: Id) => categories.findIndex((c) => c.channels.includes(channel));
const copy = (categories: Category[]) => categories.map((c) => ({ ...c, channels: [...c.channels] }));

/**
 * Move a channel one place up (-1) or down (+1) among the channels shown. Past the edge of its category it
 * joins the end of the previous category or the start of the next. A channel in no category stays put.
 */
export function moveChannel(categories: Category[], channel: Id, delta: -1 | 1, visible: (id: Id) => boolean): Category[] | null {
  const ci = where(categories, channel);
  if (ci < 0) return null;
  const next = copy(categories);
  const list = next[ci]!.channels;
  const i = list.indexOf(channel);
  let j = i + delta;
  while (j >= 0 && j < list.length && !visible(list[j]!)) j += delta;
  if (j >= 0 && j < list.length) {
    list.splice(i, 1);
    // Land just past the visible neighbour, so hidden channels between keep their places relative to it.
    const at = list.indexOf(categories[ci]!.channels[j]!);
    list.splice(delta < 0 ? at : at + 1, 0, channel);
    return next;
  }
  const target = ci + delta;
  if (target < 0 || target >= next.length) return null;
  list.splice(i, 1);
  if (delta < 0) next[target]!.channels.push(channel);
  else next[target]!.channels.unshift(channel);
  return next;
}

/** Put a channel at the end of a category, or in none with null. */
export function moveChannelTo(categories: Category[], channel: Id, category: string | null): Category[] {
  const next = copy(categories).map((c) => ({ ...c, channels: c.channels.filter((id) => id !== channel) }));
  const target = next.find((c) => c.id === category);
  if (target) target.channels.push(channel);
  return next;
}

/** Drop beside a channel, or at the end of a category, preserving all other IDs. */
export function dropChannel(categories: Category[], channel: Id, category: string | null, target?: Id, after = false): Category[] | null {
  if (target === channel) return null;
  if (category !== null && !categories.some((c) => c.id === category)) return null;
  if (target && category !== null && !categories.find((c) => c.id === category)?.channels.includes(target)) return null;
  const next = moveChannelTo(categories, channel, category);
  const dest = next.find((c) => c.id === category);
  if (dest && target) {
    dest.channels = dest.channels.filter((id) => id !== channel);
    dest.channels.splice(dest.channels.indexOf(target) + (after ? 1 : 0), 0, channel);
  }
  return JSON.stringify(next) === JSON.stringify(categories) ? null : next;
}

export function moveCategory(categories: Category[], category: string, delta: -1 | 1): Category[] | null {
  const i = categories.findIndex((c) => c.id === category);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= categories.length) return null;
  const next = copy(categories);
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

export const addCategory = (categories: Category[], id: string, title: string): Category[] => [...copy(categories), { id, title, channels: [] }];

export const renameCategory = (categories: Category[], id: string, title: string): Category[] =>
  copy(categories).map((c) => (c.id === id ? { ...c, title } : c));

/** Its channels go to no category, at the top of the sidebar. */
export const deleteCategory = (categories: Category[], id: string): Category[] => copy(categories).filter((c) => c.id !== id);

// ---------- the server rail (M4.8 task 10a) ----------

/** The rail's servers in order: those Stoat's `ordering` names first, in its order, then the rest by ID. */
export function railOrder(stored: readonly Id[], present: Iterable<Id>): Id[] {
  const here = new Set(present);
  const named = [...new Set(stored)].filter((id) => here.has(id));
  const known = new Set(named);
  return [...named, ...[...here].filter((id) => !known.has(id)).sort()];
}

/** Puts `server` at index `to` of the order without it. */
export function placeServer(shown: readonly Id[], server: Id, to: number): Id[] {
  const rest = shown.filter((id) => id !== server);
  rest.splice(Math.max(0, Math.min(to, rest.length)), 0, server);
  return rest;
}

/** One place up (-1) or down (+1), or null at the end it would leave. */
export function moveServer(shown: readonly Id[], server: Id, delta: -1 | 1): Id[] | null {
  const i = shown.indexOf(server);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= shown.length) return null;
  return placeServer(shown, server, j);
}

/**
 * The list to store: the shown order, then the stored IDs of servers not shown now, so a server that is only
 * missing for a moment, or one Stoat's own client knows of, keeps its place.
 */
export function orderingFor(shown: readonly Id[], stored: readonly Id[]): Id[] {
  const set = new Set(shown);
  return [...shown, ...stored.filter((id) => !set.has(id))];
}

/**
 * Stoat's `ordering` setting with `servers` replaced. Stoat's own client writes this key too, so every other
 * field in the stored JSON is kept as it was.
 */
export function writeOrdering(raw: string | undefined, servers: readonly Id[]): string {
  let o: Record<string, unknown> = {};
  try {
    const v = JSON.parse(raw ?? '{}') as unknown;
    if (v && typeof v === 'object' && !Array.isArray(v)) o = v as Record<string, unknown>;
  } catch {
    // Unreadable: written fresh.
  }
  return JSON.stringify({ ...o, servers });
}
