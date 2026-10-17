/**
 * Which channel categories are collapsed, per server, on this device (M4.8 task 7), under `concord:collapsed` as
 * `{server: [category IDs]}`. Shared by the channel sidebar and keyboard stepping, which walk the same channels.
 * A convenience: every storage access is wrapped, and bad or oversized data is dropped when read.
 */
import type { Channel, Id, Store } from '@concord/domain';

const KEY = 'concord:collapsed';
/** Caps on what is kept, so servers left long ago can't grow it without bound. */
export const COLLAPSED_SERVERS = 200;
export const COLLAPSED_PER_SERVER = 100;

export type CollapsedMap = Record<Id, Id[]>;

/** The stored map, tolerating bad data and capping its size. */
export function parseCollapsed(raw: unknown): CollapsedMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: CollapsedMap = {};
  for (const [server, ids] of Object.entries(raw as Record<string, unknown>).slice(-COLLAPSED_SERVERS)) {
    if (!Array.isArray(ids)) continue;
    const kept = [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))].slice(-COLLAPSED_PER_SERVER);
    if (kept.length) out[server] = kept;
  }
  return out;
}

function read(): CollapsedMap {
  try {
    return parseCollapsed(JSON.parse(localStorage.getItem(KEY) ?? '{}'));
  } catch {
    return {};
  }
}

class Collapsed {
  #map = $state<CollapsedMap>(typeof localStorage === 'undefined' ? {} : read());

  is(server: Id, category: Id): boolean {
    return !!this.#map[server]?.includes(category);
  }

  toggle(server: Id, category: Id): void {
    const ids = this.#map[server] ?? [];
    const next = ids.includes(category) ? ids.filter((id) => id !== category) : [...ids, category];
    // Re-inserted at the end, so the caps drop the servers touched longest ago.
    const { [server]: _, ...rest } = this.#map;
    this.#map = parseCollapsed(next.length ? { ...rest, [server]: next } : rest);
    try {
      localStorage.setItem(KEY, JSON.stringify(this.#map));
    } catch {
      // Storage blocked; collapsed for this tab only.
    }
  }
}

export const collapsed = new Collapsed();

/** A collapsed category still shows its selected and unread channels, as on Discord. */
export function shownInCategory(store: Store, server: Id, category: Id | null, channel: Channel, active: Id | null): boolean {
  return !category || !collapsed.is(server, category) || channel.id === active || (store.isUnread(channel.id) && !store.notificationsMuted(channel.id));
}
