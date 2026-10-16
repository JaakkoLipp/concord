/**
 * Keyboard stepping through channels, DMs and servers (M4.8 task 2). The step functions are pure, over plain
 * arrays of IDs; the list builders read the store the way the sidebars do, so the keys walk what is on screen.
 */
import type { Id, Store } from '@concord/domain';
import { canView, orderedServers } from './channels.ts';

export type Direction = 'up' | 'down';

/**
 * The item one step from `current` in `ids` (in `dir`), wrapping at the ends. With no current item, or one that
 * isn't in the list, Down goes to the first item and Up to the last. `eligible` limits the steps to some items,
 * such as the unread ones, so a step passes over the rest. Undefined when no other item is eligible.
 */
export function stepFrom(ids: readonly Id[], current: Id | null, dir: Direction, eligible: (id: Id) => boolean = () => true): Id | undefined {
  const n = ids.length;
  if (!n) return undefined;
  const at = current === null ? -1 : ids.indexOf(current);
  // Counting from just before the first item, or just after the last, when there is no current item.
  const start = at >= 0 ? at : dir === 'down' ? -1 : n;
  for (let k = 1; k <= n; k++) {
    const i = (((start + (dir === 'down' ? k : -k)) % n) + n) % n;
    const id = ids[i]!;
    if (id !== current && eligible(id)) return id;
  }
  return undefined;
}

/** The next channel in the list, as Alt+Up and Alt+Down go. */
export function stepChannel(ids: readonly Id[], current: Id | null, dir: Direction): Id | undefined {
  return stepFrom(ids, current, dir);
}

/** The next unread channel after the current one, as Alt+Shift+Up and Alt+Shift+Down go. */
export function stepUnread(ids: readonly Id[], current: Id | null, dir: Direction, unread: (id: Id) => boolean): Id | undefined {
  return stepFrom(ids, current, dir, unread);
}

/** The next server in the rail's order, as Ctrl+Alt+Up and Ctrl+Alt+Down go. */
export function stepServer(ids: readonly Id[], current: Id | null, dir: Direction): Id | undefined {
  return stepFrom(ids, current, dir);
}

/**
 * A server's channels in sidebar order, for this account, including the ones in a collapsed category. The sidebar
 * hides those, but its collapsed state is component-local $state in ChannelSidebar.svelte, which this list can't
 * read; until that state is shared (M4.8 task 7), stepping can land on a channel the sidebar has folded away.
 */
export function serverChannelIds(store: Store, server: Id): Id[] {
  return store.channelTree(server).flatMap((group) => group.channels.filter((c) => canView(store, c)).map((c) => c.id));
}

/** The DMs and groups in the DM sidebar's order. */
export function dmChannelIds(store: Store): Id[] {
  return store.dmList().map((c) => c.id);
}

/** Unread as the sidebar styles it: unread, and not muted for notifications. */
export const unreadShown = (store: Store) => (id: Id) => store.isUnread(id) && !store.notificationsMuted(id);

/** The servers in the rail's order. */
export function serverIds(store: Store): Id[] {
  return orderedServers(store).map((s) => s.id);
}
