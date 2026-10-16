/**
 * The normalised client store (client.md section 4). Entities live in reactive maps keyed by ID, and each
 * handler is an idempotent upsert, so a REST response and its WebSocket echo may arrive in either order.
 * Entries are replaced, never mutated, so a component reading one key re-renders only when that key changes.
 */
import { emptyNotifications, muteActive, type NotificationLevel, type NotificationSettings } from '../notify.ts';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import type { ConnectionState, DomainEvent } from '../backend.ts';
import type { Channel, Emoji, Id, Member, Message, NodeInfo, Presence, Profile, Relationship, Ring, Server, Unread, User, VoiceState } from '../entities.ts';

export interface MessageWindow {
  /** Oldest first, one contiguous stretch of history. */
  ids: Id[];
  atNewest: boolean;
  atOldest: boolean;
}

/**
 * A message sent from this client and not yet confirmed (client.md section 4.3). Its key is a client ULID,
 * sent as the idempotency key, which Stoat echoes as the real message's nonce.
 */
export interface PendingMessage {
  key: Id;
  channel: Id;
  content: string;
  replies: { id: Id; mention: boolean }[];
  attachments: Id[];
  /** Files to upload before sending, with progress, and their ID once uploaded. A retry uploads only what is missing. */
  files: PendingFile[];
  state: 'sending' | 'failed';
  /** Why it failed: the backend's error type, or `network` when the request may not have arrived. */
  error?: string;
}

export interface PendingFile {
  file: Blob;
  name: string;
  size: number;
  /** A local preview URL for images, made by the UI. */
  preview?: string | undefined;
  progress: number;
  id?: Id | undefined;
}


/** Emoji favourites and use counts, keyed by the Unicode emoji or a custom emoji's ID (client.md section 6.4). */
/**
 * A favourite GIF (m4.5 follow-up): the link that is sent, which Stoat's January embeds as the GIF, and the
 * media to show it with in the picker, through January too.
 */
export interface FavouriteGif {
  url: string;
  src: string;
  video: boolean;
  width: number;
  height: number;
}

export interface EmojiPrefs {
  favourites: string[];
  usage: Record<string, number>;
}

export interface Settings {
  notifications: NotificationSettings;
  serverOrder: Id[];
  /** Servers whose muted channels are hidden, synced as `concord:hiddenMutedChannels`. */
  hiddenMutedChannels: Record<Id, boolean>;
}

export const memberKey = (server: Id, user: Id) => `${server}:${user}`;
/** ULIDs sort by time as strings. */
export const newer = (a: Id | undefined, b: Id | undefined) => !!a && (!b || a > b);

/**
 * One call in one channel. Stoat's start time has whole seconds only, so two calls can share one; the stopped
 * ring a channel remembers is forgotten when its call ends, which tells them apart.
 */
const ringKey = (r: Ring) => `${r.channel}:${r.startedAt}`;

/** Messages kept in one window at most (client.md section 6.1). */
export const WINDOW_MAX = 200;

function omit<T extends object>(o: T, keys: readonly PropertyKey[]): T {
  if (!keys.length) return o;
  const out = { ...o } as Record<PropertyKey, unknown>;
  for (const k of keys) delete out[k];
  return out as T;
}

export class Store {
  self = $state<User | null>(null);
  node = $state<NodeInfo | null>(null);
  connection = $state<ConnectionState>('offline');
  settings = $state<Settings>({ notifications: emptyNotifications(), serverOrder: [], hiddenMutedChannels: {} });
  /** A clock the session moves on, so timed mutes end on their own. */
  now = $state(Date.now());
  emojiPrefs = $state<EmojiPrefs>({ favourites: [], usage: {} });
  /** Favourite GIFs, newest first, synced through Stoat's settings as `concord:gifs`. */
  favouriteGifs = $state<FavouriteGif[]>([]);
  /** DMs this account closed, with the newest message at the time (m2b-plan.md decision 3). */
  closedDms = $state<Record<Id, Id>>({});
  /** The status this account chose in the menu, from `concord:status` (m2b-plan.md decision 2). */
  chosenStatus = $state<Presence | null>(null);

  readonly users = new SvelteMap<Id, User>();
  readonly servers = new SvelteMap<Id, Server>();
  readonly channels = new SvelteMap<Id, Channel>();
  readonly members = new SvelteMap<string, Member>();
  readonly emojis = new SvelteMap<Id, Emoji>();
  readonly unreads = new SvelteMap<Id, Unread>();
  readonly messages = new SvelteMap<Id, Message>();
  readonly windows = new SvelteMap<Id, MessageWindow>();
  readonly profiles = new SvelteMap<Id, Profile>();
  readonly mutuals = new SvelteMap<Id, { users: Id[]; servers: Id[]; channels: Id[] }>();
  /** Channel to user to the time their typing indicator expires. */
  readonly typing = new SvelteMap<Id, Record<Id, number>>();
  /** Channel to user to their voice state. Only occupied channels have an entry (client.md section 10.1). */
  readonly voice = new SvelteMap<Id, Record<Id, VoiceState>>();
  /** DM and group calls ringing this account, by channel (client.md section 10.8). */
  readonly rings = new SvelteMap<Id, Ring>();
  /** Per channel, the `ringKey` of a ring stopped while its call runs, so a repeat of Stoat's event doesn't ring again. */
  private readonly stoppedRings = new Map<Id, string>();
  /** Servers whose full member list has been fetched. */
  readonly memberListLoaded = new SvelteMap<Id, number>();
  /** Messages sent from this client and not yet confirmed, by key. Window reloads and Ready leave them alone. */
  readonly pending = new SvelteMap<Id, PendingMessage>();
  /** Messages deleted while this client watched, so a reply bar can tell deleted from merely unloaded. */
  readonly deleted = new SvelteSet<Id>();
  /** Keys this client has sent with, so a confirmed message keeps its pending row's identity in the list. */
  readonly ownNonces = new Set<string>();
  /**
   * The newest message this client has marked read, per channel. Stoat applies acks a few seconds late,
   * so unread state fetched in that gap may be older; it can raise this floor but never lower it.
   */
  private readonly readFloor = new Map<Id, Id>();

  get selfId(): Id | undefined {
    return this.self?.id;
  }

  // ---------- writes from REST ----------

  upsertUsers(users: User[]): void {
    for (const u of users) {
      this.users.set(u.id, u);
      if (u.id === this.self?.id) this.self = u;
    }
  }

  upsertMembers(members: Member[]): void {
    for (const m of members) this.members.set(memberKey(m.server, m.user), m);
  }

  upsertMessages(messages: Message[]): void {
    for (const m of messages) {
      this.messages.set(m.id, m);
      this.settle(m);
    }
  }

  setUnreads(unreads: Unread[]): void {
    this.unreads.clear();
    for (const u of unreads) this.unreads.set(u.channel, this.withFloor(u));
    for (const [channel, id] of this.readFloor) if (!this.unreads.has(channel)) this.unreads.set(channel, { channel, lastId: id, mentions: [] });
  }

  /** Mark a channel read up to a message, locally and at once. The session sends the ack. */
  markRead(channel: Id, message: Id): void {
    if (newer(message, this.readFloor.get(channel))) this.readFloor.set(channel, message);
    const u = this.unreads.get(channel) ?? { channel, mentions: [] };
    this.unreads.set(channel, this.withFloor(u));
  }

  /**
   * Move the read point back to just after `before`, for "Mark unread": `before` is the message before the one
   * marked, or undefined when it is the channel's first. Mentions already read stay read.
   */
  markUnread(channel: Id, before: Id | undefined): void {
    if (before) this.readFloor.set(channel, before);
    else this.readFloor.delete(channel);
    const u = this.unreads.get(channel);
    this.unreads.set(channel, { channel, mentions: u?.mentions ?? [], ...(before ? { lastId: before } : {}) });
  }

  /** The read point is the later of the server's and this client's; mentions at or before it are read. */
  private withFloor(u: Unread): Unread {
    const floor = this.readFloor.get(u.channel);
    const lastId = newer(floor, u.lastId) ? floor : u.lastId;
    if (!lastId) return u;
    const mentions = u.mentions.filter((id) => id > lastId);
    return lastId === u.lastId && mentions.length === u.mentions.length ? u : { ...u, lastId, mentions };
  }

  /** A confirmed message replaces its pending one, whichever way it arrived: send response, echo or history. */
  private settle(m: Message): void {
    if (m.nonce && this.pending.has(m.nonce)) this.pending.delete(m.nonce);
  }

  /** Pending messages in a channel, oldest first. */
  pendingIn(channel: Id): PendingMessage[] {
    return [...this.pending.values()].filter((p) => p.channel === channel).sort((a, b) => (a.key < b.key ? -1 : 1));
  }

  /** Replace a channel's window with a fetched page, given oldest first. */
  setWindow(channel: Id, page: Message[], flags: { atNewest: boolean; atOldest: boolean }): void {
    this.dropWindowMessages(channel);
    this.upsertMessages(page);
    this.windows.set(channel, { ids: page.map((m) => m.id), ...flags });
  }

  /** Add an older page in front of the window, trimming the newest end beyond WINDOW_MAX. */
  prependPage(channel: Id, page: Message[], atOldest: boolean): void {
    const w = this.windows.get(channel);
    if (!w) return this.setWindow(channel, page, { atNewest: false, atOldest });
    this.upsertMessages(page);
    const have = new Set(w.ids);
    let ids = [...page.map((m) => m.id).filter((id) => !have.has(id)), ...w.ids];
    let atNewest = w.atNewest;
    if (ids.length > WINDOW_MAX) {
      for (const id of ids.slice(WINDOW_MAX)) this.messages.delete(id);
      ids = ids.slice(0, WINDOW_MAX);
      atNewest = false;
    }
    this.windows.set(channel, { ids, atNewest, atOldest });
  }

  /** Add a newer page after the window, trimming the oldest end beyond WINDOW_MAX. */
  appendPage(channel: Id, page: Message[], atNewest: boolean): void {
    const w = this.windows.get(channel);
    if (!w) return this.setWindow(channel, page, { atNewest, atOldest: false });
    this.upsertMessages(page);
    const have = new Set(w.ids);
    let ids = [...w.ids, ...page.map((m) => m.id).filter((id) => !have.has(id))];
    let atOldest = w.atOldest;
    if (ids.length > WINDOW_MAX) {
      for (const id of ids.slice(0, ids.length - WINDOW_MAX)) this.messages.delete(id);
      ids = ids.slice(ids.length - WINDOW_MAX);
      atOldest = false;
    }
    this.windows.set(channel, { ids, atNewest, atOldest });
  }

  /** Forget a channel's window and the messages only it held. */
  dropWindow(channel: Id): void {
    this.dropWindowMessages(channel);
  }

  private dropWindowMessages(channel: Id): void {
    for (const id of this.windows.get(channel)?.ids ?? []) this.messages.delete(id);
    this.windows.delete(channel);
  }

  // ---------- events ----------

  apply(e: DomainEvent): void {
    switch (e.type) {
      case 'ready': {
        // Ready replaces what it covers (architecture section 4.3): no merging with stale state.
        this.upsertUsers(e.users);
        // Ready lists everyone this account has a relationship with. Anyone else's ended while disconnected.
        const listed = new Set(e.users.map((u) => u.id));
        for (const u of this.users.values()) {
          if (!listed.has(u.id) && u.id !== this.selfId && u.relationship !== 'None') this.users.set(u.id, { ...u, relationship: 'None' });
        }
        this.servers.clear();
        for (const s of e.servers) this.servers.set(s.id, s);
        this.channels.clear();
        for (const c of e.channels) this.channels.set(c.id, c);
        for (const [k, m] of this.members) if (m.user === this.selfId) this.members.delete(k);
        this.upsertMembers(e.members);
        this.emojis.clear();
        for (const em of e.emojis) this.emojis.set(em.id, em);
        if (e.unreads) this.setUnreads(e.unreads);
        this.voice.clear();
        for (const v of e.voice) this.joinVoice(v);
        // A call that emptied while this session was away rang out unheard.
        for (const c of new Set([...this.rings.keys(), ...this.stoppedRings.keys()])) if (!this.voice.has(c)) this.callEnded(c);
        this.typing.clear();
        this.memberListLoaded.clear();
        return;
      }
      case 'messageCreate': {
        if (e.user) this.absorbAuthor(e.user);
        if (e.member) this.upsertMembers([e.member]);
        // The same message can come twice: from the socket and as our own send's response. Its link previews and
        // reactions arrive as later events, which a late send response, which has neither, mustn't undo.
        const prev = this.messages.get(e.message.id);
        const m = prev && prev.edited === e.message.edited
          ? { ...e.message, embeds: prev.embeds.length ? prev.embeds : e.message.embeds, reactions: prev.reactions }
          : e.message;
        this.messages.set(m.id, m);
        this.settle(m);
        const c = this.channels.get(m.channel);
        if (c && c.kind !== 'saved' && newer(m.id, c.lastMessageId)) this.channels.set(c.id, { ...c, lastMessageId: m.id });
        const w = this.windows.get(m.channel);
        if (w?.atNewest) this.windows.set(m.channel, this.withId(w, m.id));
        if (m.author !== this.selfId && this.mentionsSelf(m)) this.addMention(m.channel, m.id);
        this.clearTyping(m.channel, m.author);
        // An owner who leaves hands the group to someone Stoat picks, and only this message says who.
        if (m.system?.type === 'channel_ownership_changed' && c?.kind === 'group') this.channels.set(c.id, { ...this.channels.get(c.id) as typeof c, owner: m.system.to });
        return;
      }
      case 'messageUpdate': {
        const m = this.messages.get(e.id);
        if (m) this.messages.set(e.id, omit({ ...m, ...e.data }, e.clear));
        return;
      }
      case 'messageAppend': {
        const m = this.messages.get(e.id);
        // An append seen twice, as after a reconnect replays it, adds its previews once.
        const known = new Set(m?.embeds.map((x) => JSON.stringify(x)));
        const fresh = e.embeds.filter((x) => !known.has(JSON.stringify(x)));
        if (m && fresh.length) this.messages.set(e.id, { ...m, embeds: [...m.embeds, ...fresh] });
        return;
      }
      case 'messageDelete':
        return this.deleteMessages(e.channel, [e.id]);
      case 'messageBulkDelete':
        return this.deleteMessages(e.channel, e.ids);
      case 'reactionAdd': {
        const m = this.messages.get(e.id);
        if (!m) return;
        const users = m.reactions[e.emoji] ?? [];
        if (!users.includes(e.user)) this.messages.set(e.id, { ...m, reactions: { ...m.reactions, [e.emoji]: [...users, e.user] } });
        return;
      }
      case 'reactionRemove': {
        const m = this.messages.get(e.id);
        if (!m?.reactions[e.emoji]) return;
        const users = m.reactions[e.emoji]!.filter((u) => u !== e.user);
        this.messages.set(e.id, { ...m, reactions: users.length ? { ...m.reactions, [e.emoji]: users } : omit(m.reactions, [e.emoji]) });
        return;
      }
      case 'reactionClear': {
        const m = this.messages.get(e.id);
        if (m) this.messages.set(e.id, { ...m, reactions: omit(m.reactions, [e.emoji]) });
        return;
      }
      case 'channelCreate':
        this.channels.set(e.channel.id, e.channel);
        return;
      case 'channelUpdate': {
        const c = this.channels.get(e.id);
        if (c) this.channels.set(e.id, omit({ ...c, ...e.data } as Channel, e.clear));
        return;
      }
      case 'channelDelete':
        return this.forgetChannel(e.id);
      case 'groupJoin':
      case 'groupLeave': {
        const c = this.channels.get(e.id);
        if (c?.kind !== 'group') return;
        if (e.type === 'groupLeave' && e.user === this.selfId) return this.forgetChannel(e.id);
        const recipients = e.type === 'groupJoin' ? [...new Set([...c.recipients, e.user])] : c.recipients.filter((r) => r !== e.user);
        this.channels.set(e.id, { ...c, recipients });
        return;
      }
      case 'typingStart':
        if (e.user === this.selfId) return;
        this.typing.set(e.channel, { ...this.typing.get(e.channel), [e.user]: Date.now() + 10_000 });
        return;
      case 'typingStop':
        return this.clearTyping(e.channel, e.user);
      case 'ack':
        // Another session of this account read the channel. Never moves the read point back.
        if (e.user === this.selfId) this.markRead(e.channel, e.message);
        return;
      case 'serverCreate':
        this.servers.set(e.server.id, e.server);
        for (const c of e.channels) this.channels.set(c.id, c);
        for (const em of e.emojis) this.emojis.set(em.id, em);
        for (const v of e.voice ?? []) this.joinVoice(v);
        return;
      case 'serverUpdate': {
        const s = this.servers.get(e.id);
        if (s) this.servers.set(e.id, omit({ ...s, ...e.data }, e.clear));
        return;
      }
      case 'serverDelete':
        return this.removeServer(e.id);
      case 'roleUpdate': {
        const s = this.servers.get(e.server);
        if (!s) return;
        const old = s.roles[e.id] ?? { id: e.id, name: '', hoist: false, rank: 0, permissions: { allow: 0n, deny: 0n } };
        this.servers.set(s.id, { ...s, roles: { ...s.roles, [e.id]: omit({ ...old, ...e.data }, e.clear) } });
        return;
      }
      case 'roleDelete': {
        const s = this.servers.get(e.server);
        if (s) this.servers.set(s.id, { ...s, roles: omit(s.roles, [e.id]) });
        return;
      }
      case 'rolesReorder': {
        const s = this.servers.get(e.server);
        if (!s) return;
        const roles = { ...s.roles };
        e.order.forEach((id, rank) => { if (roles[id]) roles[id] = { ...roles[id]!, rank }; });
        this.servers.set(s.id, { ...s, roles });
        return;
      }
      case 'memberJoin':
        this.members.set(memberKey(e.server, e.user), e.member);
        return;
      case 'memberLeave':
        if (e.user === this.selfId) return this.removeServer(e.server);
        this.members.delete(memberKey(e.server, e.user));
        return;
      case 'memberUpdate': {
        const k = memberKey(e.server, e.user);
        const m = this.members.get(k);
        if (m) this.members.set(k, omit({ ...m, ...e.data }, e.clear));
        return;
      }
      case 'userUpdate': {
        const u = this.users.get(e.id);
        if (!u) return;
        const next = omit({ ...u, ...e.data }, e.clear);
        // Stoat doesn't send online again when someone leaves Invisible, but a visible presence means connected.
        if (e.data.presence && e.data.presence !== 'Invisible' && e.data.online === undefined) next.online = true;
        this.users.set(e.id, next);
        if (e.id === this.selfId) this.self = next;
        return;
      }
      case 'relationship': {
        // The event's user is complete: a block comes without presence or status, and the old ones must go.
        const old = this.users.get(e.user.id);
        const kept = old ? omit(old, ['online', 'presence', 'statusText']) : {};
        this.upsertUsers([{ ...kept, ...e.user, relationship: e.status }]);
        return;
      }
      case 'profileChanged':
      case 'settings':
        // The session handles these: they need a fetch or settings parsing.
        return;
      case 'emojiCreate':
        this.emojis.set(e.emoji.id, e.emoji);
        return;
      case 'emojiUpdate': {
        const em = this.emojis.get(e.id);
        if (em) this.emojis.set(e.id, { ...em, name: e.name });
        return;
      }
      case 'emojiDelete':
        this.emojis.delete(e.id);
        return;
      case 'voiceJoin':
        return this.joinVoice(e.state);
      case 'voiceMove':
        this.leaveVoice(e.from, e.state.user);
        return this.joinVoice(e.state);
      case 'voiceLeave':
        return this.leaveVoice(e.channel, e.user);
      case 'voiceUpdate': {
        // Without a join there is no joining time to build a state from, so an update for someone absent waits for one.
        const v = this.voice.get(e.channel)?.[e.user];
        if (v) this.voice.set(e.channel, { ...this.voice.get(e.channel), [e.user]: { ...v, ...e.data } });
        return;
      }
      case 'callUpdate': {
        if (e.ended) return this.callEnded(e.channel);
        const ring: Ring = { channel: e.channel, initiator: e.initiator, startedAt: e.startedAt ?? 0 };
        // Our own call, a call this account is already in, or one it already answered or ignored.
        if (ring.initiator === this.selfId || (this.selfId && this.selfId in (this.voice.get(ring.channel) ?? {}))) return;
        if (this.stoppedRings.get(ring.channel) === ringKey(ring)) return;
        const old = this.rings.get(ring.channel);
        if (!old || ringKey(old) !== ringKey(ring)) this.rings.set(ring.channel, ring);
        return;
      }
      // Private to the moved user: the voice controller follows it, and the state changes with the `voiceMove` that comes after.
      case 'voiceMoved':
      case 'unknown':
        return;
    }
  }

  private withId(w: MessageWindow, id: Id): MessageWindow {
    if (w.ids.includes(id)) return w;
    let ids = [...w.ids, id].sort();
    let atOldest = w.atOldest;
    if (ids.length > WINDOW_MAX) {
      for (const old of ids.slice(0, ids.length - WINDOW_MAX)) this.messages.delete(old);
      ids = ids.slice(ids.length - WINDOW_MAX);
      atOldest = false;
    }
    return { ...w, ids, atOldest };
  }

  /** Put back a message whose optimistic delete failed, in its place in the window if it was there. */
  restoreMessage(m: Message, inWindow: boolean): void {
    this.messages.set(m.id, m);
    this.deleted.delete(m.id);
    const w = this.windows.get(m.channel);
    if (inWindow && w && !w.ids.includes(m.id)) this.windows.set(m.channel, { ...w, ids: [...w.ids, m.id].sort() });
  }

  private deleteMessages(channel: Id, ids: Id[]): void {
    const gone = new Set(ids);
    for (const id of ids) {
      this.messages.delete(id);
      this.deleted.add(id);
    }
    const w = this.windows.get(channel);
    if (w && w.ids.some((id) => gone.has(id))) this.windows.set(channel, { ...w, ids: w.ids.filter((id) => !gone.has(id)) });
    const u = this.unreads.get(channel);
    if (u && u.mentions.some((id) => gone.has(id))) this.unreads.set(channel, { ...u, mentions: u.mentions.filter((id) => !gone.has(id)) });
  }

  /**
   * The author a message event carries. Its relationship comes from the socket's own cache, which Stoat's
   * relationship bug corrupts: a new friend can arrive as `User`, the value meant for oneself. So a known
   * user keeps the relationship it has, which only Ready and relationship events set.
   */
  private absorbAuthor(u: User): void {
    const old = this.users.get(u.id);
    const relationship = old ? old.relationship : u.relationship === 'User' && u.id !== this.selfId ? 'None' : u.relationship;
    this.upsertUsers([{ ...u, relationship }]);
  }

  /** A channel this account can no longer see: deleted, or a group it left or was removed from. */
  forgetChannel(id: Id): void {
    this.channels.delete(id);
    this.dropWindowMessages(id);
    this.unreads.delete(id);
    this.voice.delete(id);
    this.rings.delete(id);
  }

  private removeServer(id: Id): void {
    const s = this.servers.get(id);
    this.servers.delete(id);
    for (const c of s?.channels ?? []) {
      this.channels.delete(c);
      this.dropWindowMessages(c);
      this.unreads.delete(c);
      this.voice.delete(c);
    }
    for (const [k, m] of this.members) if (m.server === id) this.members.delete(k);
    for (const [k, e] of this.emojis) if (e.parent.type === 'server' && e.parent.id === id) this.emojis.delete(k);
    this.memberListLoaded.delete(id);
  }

  /** A user is in one voice channel at most, so joining one leaves any other: that covers a missed leave. */
  private joinVoice(v: VoiceState): void {
    for (const [channel, users] of [...this.voice]) if (channel !== v.channel && v.user in users) this.leaveVoice(channel, v.user);
    this.voice.set(v.channel, { ...this.voice.get(v.channel), [v.user]: v });
    // Answered, here or on another device.
    if (v.user === this.selfId) this.stopRing(v.channel);
  }

  /** Leaves only the channel named, so a late leave can't undo a join elsewhere. */
  private leaveVoice(channel: Id, user: Id): void {
    const users = this.voice.get(channel);
    if (!users || !(user in users)) return;
    const rest = omit(users, [user]);
    if (Object.keys(rest).length) this.voice.set(channel, rest);
    else {
      this.voice.delete(channel);
      // The call is over, even if Stoat's end of the ring goes missing.
      this.callEnded(channel);
    }
  }

  private callEnded(channel: Id): void {
    this.rings.delete(channel);
    this.stoppedRings.delete(channel);
  }

  /** Stop a ring: answered, ignored or rung out. The same call doesn't ring again. */
  stopRing(channel: Id): void {
    const r = this.rings.get(channel);
    if (!r) return;
    this.stoppedRings.set(channel, ringKey(r));
    this.rings.delete(channel);
  }

  private clearTyping(channel: Id, user: Id): void {
    const t = this.typing.get(channel);
    if (t && user in t) this.typing.set(channel, omit(t, [user]));
  }

  private addMention(channel: Id, message: Id): void {
    const u = this.unreads.get(channel) ?? { channel, mentions: [] };
    if (u.lastId && message <= u.lastId) return;
    if (!u.mentions.includes(message)) this.unreads.set(channel, { ...u, mentions: [...u.mentions, message] });
  }

  /** Mentions as Stoat counts them: direct, by role, and every message in a DM or group. */
  mentionsSelf(m: Message): boolean {
    const self = this.selfId;
    if (!self) return false;
    const c = this.channels.get(m.channel);
    if (c?.kind === 'dm' || c?.kind === 'group') return true;
    if (m.mentions.includes(self)) return true;
    if (c?.kind === 'text' && m.roleMentions.length) {
      const roles = this.members.get(memberKey(c.server, self))?.roles ?? [];
      if (m.roleMentions.some((r) => roles.includes(r))) return true;
    }
    return false;
  }

  // ---------- reads ----------

  isUnread(channel: Id): boolean {
    const c = this.channels.get(channel);
    if (!c || c.kind === 'saved' || !c.lastMessageId) return false;
    return newer(c.lastMessageId, this.unreads.get(channel)?.lastId);
  }

  mentionCount(channel: Id): number {
    return this.unreads.get(channel)?.mentions.length ?? 0;
  }

  /** The level a channel gets when it has none of its own: its server's, else mentions only, and all for DMs and groups (m2c-plan.md decision 1). */
  defaultLevel(channel: Id): NotificationLevel {
    const c = this.channels.get(channel);
    if (c?.kind === 'text') return this.settings.notifications.server[c.server] ?? 'mention';
    return 'all';
  }

  channelLevel(channel: Id): NotificationLevel {
    return this.settings.notifications.channel[channel] ?? this.defaultLevel(channel);
  }

  /** The channel itself is muted: its unread marker hides. */
  isMuted(channel: Id): boolean {
    return muteActive(this.settings.notifications.channelMutes[channel], this.now);
  }

  serverMuted(server: Id): boolean {
    return muteActive(this.settings.notifications.serverMutes[server], this.now);
  }

  /** Muted for notifications: the channel, or its server. */
  notificationsMuted(channel: Id): boolean {
    const c = this.channels.get(channel);
    return this.isMuted(channel) || (c?.kind === 'text' && this.serverMuted(c.server));
  }

  /** Server rail badge: unread in any visible channel that isn't muted, plus the mention total. */
  serverBadge(server: Id, canView: (c: Channel) => boolean): { unread: boolean; mentions: number } {
    const s = this.servers.get(server);
    let unread = false;
    let mentions = 0;
    const serverMuted = this.serverMuted(server);
    for (const id of s?.channels ?? []) {
      const c = this.channels.get(id);
      if (!c || !canView(c)) continue;
      mentions += this.mentionCount(id);
      if (!serverMuted && !this.isMuted(id) && this.isUnread(id)) unread = true;
    }
    return { unread, mentions };
  }

  /** Categories in server order, with uncategorised channels first, as Stoat lists them. */
  channelTree(server: Id): { id: string | null; title: string; channels: Channel[] }[] {
    const s = this.servers.get(server);
    if (!s) return [];
    const placed = new Set(s.categories.flatMap((c) => c.channels));
    const get = (ids: Id[]) => ids.map((id) => this.channels.get(id)).filter((c): c is Channel => !!c);
    const loose = get(s.channels.filter((id) => !placed.has(id)));
    const tree = s.categories.map((cat) => ({ id: cat.id as string | null, title: cat.title, channels: get(cat.channels) }));
    return loose.length ? [{ id: null, title: '', channels: loose }, ...tree] : tree;
  }

  /**
   * DMs and groups, most recent activity first. Stoat's shared `active` flag is ignored: a DM is hidden only
   * when this account closed it and nothing newer has arrived since.
   */
  dmList(): Channel[] {
    return [...this.channels.values()]
      .filter((c) => c.kind === 'group' || (c.kind === 'dm' && !(c.id in this.closedDms && !newer(c.lastMessageId, this.closedDms[c.id]))))
      .sort((a, b) => ((b as { lastMessageId?: Id }).lastMessageId ?? b.id).localeCompare((a as { lastMessageId?: Id }).lastMessageId ?? a.id));
  }

  /** The member list grouped by hoisted role, then online and offline (client.md section 7). */
  memberGroups(server: Id): { role: string | null; title: string; members: Member[] }[] {
    const s = this.servers.get(server);
    if (!s) return [];
    const hoisted = Object.values(s.roles).filter((r) => r.hoist).sort((a, b) => a.rank - b.rank);
    const groups = new Map<string, Member[]>([...hoisted.map((r) => [r.id, [] as Member[]] as const), ['online', []], ['offline', []]]);
    for (const m of this.members.values()) {
      if (m.server !== server) continue;
      const u = this.users.get(m.user);
      const online = !!u?.online && u.presence !== 'Invisible';
      if (!online) {
        groups.get('offline')!.push(m);
        continue;
      }
      const top = hoisted.find((r) => m.roles.includes(r.id));
      groups.get(top?.id ?? 'online')!.push(m);
    }
    const name = (m: Member) => (m.nickname ?? this.users.get(m.user)?.displayName ?? this.users.get(m.user)?.username ?? '').toLocaleLowerCase();
    return [...groups.entries()]
      .filter(([, list]) => list.length)
      .map(([key, list]) => ({
        role: key === 'online' || key === 'offline' ? null : key,
        title: key === 'online' || key === 'offline' ? key : s.roles[key]!.name,
        members: list.sort((a, b) => name(a).localeCompare(name(b))),
      }));
  }

  /** Users with one of these relationships to this account, by name. */
  related(...kinds: Relationship[]): User[] {
    const name = (u: User) => (u.displayName ?? u.username).toLocaleLowerCase();
    return [...this.users.values()].filter((u) => kinds.includes(u.relationship)).sort((a, b) => name(a).localeCompare(name(b)));
  }

  /** Who is in a voice channel, in the order they joined. */
  voiceParticipants(channel: Id): VoiceState[] {
    return Object.values(this.voice.get(channel) ?? {}).sort((a, b) => a.joinedAt - b.joinedAt || a.user.localeCompare(b.user));
  }

  /** When the earliest of the people now in a voice channel joined, for its timer; undefined when it's empty. */
  voiceSince(channel: Id): number | undefined {
    const states = Object.values(this.voice.get(channel) ?? {});
    return states.length ? Math.min(...states.map((v) => v.joinedAt)) : undefined;
  }

  /** The voice channel a user is in, if any this account can see. */
  voiceChannelOf(user: Id): Id | undefined {
    for (const [channel, users] of this.voice) if (user in users) return channel;
    return undefined;
  }

  /** Display name in a server: nickname, then display name, then username. */
  displayName(user: Id, server?: Id): string {
    const m = server ? this.members.get(memberKey(server, user)) : undefined;
    const u = this.users.get(user);
    return m?.nickname ?? u?.displayName ?? u?.username ?? '';
  }

  /** The colour of the member's most important coloured role. */
  roleColour(user: Id, server: Id): string | undefined {
    const s = this.servers.get(server);
    const m = this.members.get(memberKey(server, user));
    if (!s || !m) return undefined;
    return m.roles.map((id) => s.roles[id]).filter((r) => r?.colour).sort((a, b) => a!.rank - b!.rank)[0]?.colour;
  }

  clear(): void {
    this.self = null;
    for (const map of [this.users, this.servers, this.channels, this.members, this.emojis, this.unreads, this.messages, this.windows, this.profiles, this.mutuals, this.typing, this.voice, this.rings, this.memberListLoaded, this.pending]) {
      (map as SvelteMap<unknown, unknown>).clear();
    }
    this.ownNonces.clear();
    this.stoppedRings.clear();
    this.readFloor.clear();
    this.deleted.clear();
    this.settings = { notifications: emptyNotifications(), serverOrder: [], hiddenMutedChannels: {} };
    this.emojiPrefs = { favourites: [], usage: {} };
    this.favouriteGifs = [];
    this.closedDms = {};
    this.chosenStatus = null;
  }
}
