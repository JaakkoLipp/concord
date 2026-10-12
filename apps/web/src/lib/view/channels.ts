/** Channel helpers for the shell: visibility, names and the last channel visited per server. */
import { Permission, channelPermissions, has, memberKey, type Channel, type Id, type Server, type Store } from '@concord/domain';

export function canView(store: Store, channel: Channel): boolean {
  const self = store.self;
  if (!self) return false;
  if (channel.kind !== 'text') return channel.kind !== 'saved' || channel.user === self.id;
  const server = store.servers.get(channel.server);
  if (!server) return false;
  const member = store.members.get(memberKey(server.id, self.id));
  const relationship = (u: Id) => store.users.get(u)?.relationship ?? 'None';
  return has(channelPermissions(channel, { self, server, ...(member ? { member } : {}), relationship }), Permission.ViewChannel);
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
