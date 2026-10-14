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
