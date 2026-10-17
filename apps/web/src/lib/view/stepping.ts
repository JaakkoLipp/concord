/**
 * Keyboard stepping through channels, DMs and servers (M4.8 task 2). The step functions are pure, over plain
 * arrays of IDs; the list builders read the store the way the sidebars do, so the keys walk what is on screen.
 */
import type { Id, Store } from '@concord/domain';
import { canView, railOf } from './channels.ts';
import { openFolders } from './folders.svelte.ts';
import { shownInCategory } from './collapsed.svelte.ts';

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
 * A server's channels as the sidebar shows them, in its order, for this account: a collapsed category keeps only its
 * selected (`active`) and unread channels, and hidden muted channels are left out.
 */
export function serverChannelIds(store: Store, server: Id, active: Id | null): Id[] {
  const hideMuted = !!store.settings.hiddenMutedChannels[server];
  return store.channelTree(server).flatMap((group) => group.channels
    .filter((c) => canView(store, c) && !(hideMuted && store.notificationsMuted(c.id)) && shownInCategory(store, server, group.id, c, active))
    .map((c) => c.id));
}

/** The DMs and groups in the DM sidebar's order. */
export function dmChannelIds(store: Store): Id[] {
  return store.dmList().map((c) => c.id);
}

/** Unread as the sidebar styles it: unread, and not muted for notifications. */
export const unreadShown = (store: Store) => (id: Id) => store.isUnread(id) && !store.notificationsMuted(id);

/**
 * The servers in the rail's order, as Ctrl+Alt+Up and Down step through them: all of an open folder's, and of a
 * closed one only its first server, or the one open now when the step starts inside it.
 */
export function serverIds(store: Store, current: Id | null): Id[] {
  return railOf(store).flatMap((i) => {
    if (i.kind === 'server') return [i.id];
    if (openFolders.is(i.folder.id)) return i.folder.servers;
    return [current && i.folder.servers.includes(current) ? current : i.folder.servers[0]!];
  });
}
