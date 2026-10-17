/** Channel helpers for the shell: visibility, names and the last channel visited per server. */
import { Permission, channelPermissions, has, memberKey, type Channel, type Id, type Server, type Store } from '@concord/domain';
import { permissionTime } from './clock.svelte.ts';

/** This account's permissions in a channel. Read reactively, they change again when a timeout ends. */
export function permissionsIn(store: Store, channel: Channel): bigint {
  const self = store.self;
  if (!self) return 0n;
  const server = channel.kind === 'text' ? store.servers.get(channel.server) : undefined;
  if (channel.kind === 'text' && !server) return 0n;
  const member = server ? store.members.get(memberKey(server.id, self.id)) : undefined;
  const relationship = (u: Id) => store.users.get(u)?.relationship ?? 'None';
  const isBot = (u: Id) => !!store.users.get(u)?.bot;
  const now = permissionTime(member?.timeout);
  return channelPermissions(channel, { self, ...(server ? { server } : {}), ...(member ? { member } : {}), relationship, isBot, now });
}

/** What this account may do in a channel's call. A DM or group call allows everything (Stoat's DM defaults). */
export interface CallRights { connect: boolean; speak: boolean; video: boolean; listen: boolean }

export function callRights(store: Store, channel: Channel | undefined): CallRights {
  if (!channel) return { connect: true, speak: true, video: true, listen: true };
  const p = permissionsIn(store, channel);
  return { connect: has(p, Permission.Connect), speak: has(p, Permission.Speak), video: has(p, Permission.Video), listen: has(p, Permission.Listen) };
}

export function canView(store: Store, channel: Channel): boolean {
  if (!store.self) return false;
  if (channel.kind !== 'text') return channel.kind !== 'saved' || channel.user === store.self.id;
  return has(permissionsIn(store, channel), Permission.ViewChannel);
}

export type SendBlock = 'permission' | 'blocked' | 'blockedBy' | 'notFriend' | 'timeout';

/** Why this account can't send in a channel, or null when it can. */
export function sendBlock(store: Store, channel: Channel): SendBlock | null {
  if (channel.kind === 'dm') {
    const rel = store.users.get(dmPartner(store, channel) ?? '')?.relationship;
    if (rel === 'Blocked') return 'blocked';
    if (rel === 'BlockedOther') return 'blockedBy';
  }
  if (has(permissionsIn(store, channel), Permission.SendMessage)) return null;
  if (channel.kind === 'dm') return 'notFriend';
  if (channel.kind === 'text') {
    const timeout = store.members.get(memberKey(channel.server, store.selfId ?? ''))?.timeout;
    if (timeout && new Date(timeout) > permissionTime(timeout)) return 'timeout';
  }
  return 'permission';
}

/** The other person in a DM, or undefined for groups. */
export function dmPartner(store: Store, channel: Channel): Id | undefined {
  if (channel.kind !== 'dm') return undefined;
  return channel.recipients.find((r) => r !== store.selfId) ?? store.selfId;
}

export function channelName(store: Store, channel: Channel): string {
  switch (channel.kind) {
    case 'text': return channel.name;
    case 'group': return channel.name;
    case 'dm': return store.displayName(dmPartner(store, channel) ?? '');
    case 'saved': return '';
  }
}

/** Servers in the user's saved order, then any others by ID. */
export function orderedServers(store: Store): Server[] {
  const order = store.settings.serverOrder;
  const all = [...store.servers.values()];
  const rank = (s: Server) => { const i = order.indexOf(s.id); return i < 0 ? order.length : i; };
  return all.sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
}

/** First text channel the user can see, in sidebar order. */
export function firstChannel(store: Store, server: Id): Id | undefined {
  for (const group of store.channelTree(server)) {
    for (const c of group.channels) if (c.kind === 'text' && !c.voice && canView(store, c)) return c.id;
  }
  return undefined;
}

const LAST_KEY = 'concord:last-channel';

/** Remembered per browser, so /app reopens where the user was. A convenience, never essential. */
export function rememberChannel(server: Id | '@me', channel: Id): void {
  try {
    const map = JSON.parse(localStorage.getItem(LAST_KEY) ?? '{}') as Record<string, string>;
    map[server] = channel;
    map.last = `${server}/${channel}`;
    localStorage.setItem(LAST_KEY, JSON.stringify(map));
  } catch {
    // Storage blocked; nothing to remember.
  }
}

export function recalled(key: string): string | undefined {
  try {
    return (JSON.parse(localStorage.getItem(LAST_KEY) ?? '{}') as Record<string, string>)[key];
  } catch {
    return undefined;
  }
}

/** Initials for a server without an icon: the first letter of up to three words. */
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 3).map((w) => [...w][0]).join('');
