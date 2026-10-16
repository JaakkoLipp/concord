/**
 * The quick switcher's rows (M4.8 task 3): what the box lists for a query. `results` is pure, over plain places,
 * and ranks them with composer/rank.ts's `best`, which orders ties by name, so the list never depends on map order.
 * `placesFrom` reads the store the way the sidebars do: the channels this account can view, its servers, DMs and
 * groups, and the people it could start a conversation with.
 */
import type { Store } from '@concord/domain';
import { best } from '../composer/rank.ts';
import { canView, channelName } from './channels.ts';

export type PlaceKind = 'channel' | 'voice' | 'server' | 'dm' | 'person';

/** One thing the switcher can go to. */
export interface Place {
  kind: PlaceKind;
  /** A channel's or DM's ID, a server's ID, or a person's user ID. */
  id: string;
  /** What the query is matched against: a channel's name, a server's or group's name, a DM partner's or a person's display name. */
  label: string;
  /** Shown under the label, and matched too for a person: a channel's server, a person's username. */
  detail?: string;
  /** A channel's server, which its route needs. */
  server?: string;
}

export interface Row extends Place {
  /** The text shown: a channel's name with a #, as the sidebar labels it; anything else as its label. */
  title: string;
}

/** The longest list the switcher shows. */
export const MAX_ROWS = 20;

const isChannel = (p: Place) => p.kind === 'channel' || p.kind === 'voice';
const titleOf = (p: Place) => (isChannel(p) ? `#${p.label}` : p.label);
const namesOf = (p: Place) => (p.kind === 'person' && p.detail ? [p.label, p.detail] : [p.label]);

/**
 * The rows for a query. Empty: the recent places, newest first, from `recent` (channel and DM IDs), skipping any
 * that aren't in `places` any more. Otherwise the places that match, best first, capped at MAX_ROWS.
 */
export function results(query: string, places: readonly Place[], recent: readonly string[]): Row[] {
  const q = query.trim();
  let found: Place[];
  if (q) {
    found = best([...places], namesOf, q);
  } else {
    const byId = new Map(places.filter((p) => isChannel(p) || p.kind === 'dm').map((p) => [p.id, p] as const));
    found = recent.flatMap((id) => byId.get(id) ?? []);
  }
  return found.slice(0, MAX_ROWS).map((p) => ({ ...p, title: titleOf(p) }));
}

/**
 * Every place this account can go to. A person is offered only with no open DM, since that one is already in the
 * list, and not when either side has blocked the other. A closed DM still offers the person, and opening it again
 * shows it (Session.openDm).
 */
export function placesFrom(store: Store): Place[] {
  const out: Place[] = [];
  for (const c of store.channels.values()) {
    if (c.kind !== 'text' || !canView(store, c)) continue;
    out.push({ kind: c.voice ? 'voice' : 'channel', id: c.id, label: c.name, detail: store.servers.get(c.server)?.name ?? '', server: c.server });
  }
  for (const s of store.servers.values()) out.push({ kind: 'server', id: s.id, label: s.name });
  for (const c of store.dmList()) out.push({ kind: 'dm', id: c.id, label: channelName(store, c) });

  const self = store.selfId;
  const withDm = new Set(store.dmList().flatMap((c) => (c.kind === 'dm' ? c.recipients : [])));
  for (const u of store.users.values()) {
    if (u.id === self || withDm.has(u.id) || u.relationship === 'Blocked' || u.relationship === 'BlockedOther') continue;
    const label = store.displayName(u.id);
    if (label) out.push({ kind: 'person', id: u.id, label, detail: u.username });
  }
  return out.filter((p) => p.label !== '');
}
