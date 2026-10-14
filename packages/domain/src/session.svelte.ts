/**
 * One signed-in session: connects the backend to the store and runs the cold start after every connect
 * (architecture section 4.3). Commands the UI calls live here; M2 adds the write actions.
 */
import type { Backend, DomainEvent, Gateway, GroupEdit, SearchQuery, SelfEdit } from './backend.ts';
import type { Id, Message, Presence, Relationship, User } from './entities.ts';
import { SelfQueue } from './selfqueue.ts';
import { ServerAdmin } from './admin.svelte.ts';
import { ACTIVE_KEY, IdleTracker } from './idle.ts';
import { BackendError } from './errors.ts';
import { Store, memberKey, newer, type EmojiPrefs, type PendingMessage, type Settings } from './store/store.svelte.ts';
import { parseNotifications, writeNotifications, type NotificationLevel, type NotificationSettings } from './notify.ts';
import { HOLD_MS, Latest } from './latest.ts';
import { ulid, ulidTime } from './ulid.ts';

const PAGE = 100;
const FOCUS_REFETCH_MS = 60_000;
/** Typing timing from Stoat's own client: start at most this often, and stop after this long without input. */
export const TYPING_EVERY_MS = 2_500;
export const TYPING_STOP_MS = 1_000;
/** At most one ack per channel in this time (m2a-plan.md decision 5). */
export const ACK_EVERY_MS = 2_000;
/** A failed ack is sent again after this long. */
const ACK_RETRY_MS = 5_000;
const POLL_MS = 2 * 60_000;
/** How often timed mutes are checked for ending. */
const CLOCK_MS = 15_000;

/** This account losing a server, and why. `left` covers leaving or deleting it from this session or another. */
export interface ServerRemoval {
  server: Id;
  name: string;
  reason: 'kicked' | 'banned' | 'deleted' | 'left';
}

const oldestFirst = (list: Message[]) => [...list].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

export function parseSettings(raw: Record<string, { value: string }>): Settings {
  const out: Settings = { notifications: parseNotifications(raw.notifications?.value), serverOrder: [] };
  try {
    const o = JSON.parse(raw.ordering?.value ?? '{}') as { servers?: Id[] };
    if (Array.isArray(o.servers)) out.serverOrder = o.servers.filter((s) => typeof s === 'string');
  } catch {
    // As above.
  }
  return out;
}

/** Synced-settings key for emoji favourites and use counts (m2a-plan.md decision 4). */
export const EMOJI_KEY = 'concord:emoji';
/** Synced-settings key for DMs this account closed (m2b-plan.md decision 3). */
export const CLOSED_DMS_KEY = 'concord:closedDms';
/** Closed DMs remembered at most, the most recently closed. */
const CLOSED_KEPT = 200;

export function parseClosedDms(raw: string | undefined): Record<Id, Id> {
  try {
    const v = JSON.parse(raw ?? '{}') as Record<string, unknown>;
    return Object.fromEntries(Object.entries(v).filter((e): e is [string, string] => typeof e[1] === 'string'));
  } catch {
    return {};
  }
}

/** Synced-settings key for the status chosen in the menu (m2b-plan.md decision 2). */
export const STATUS_KEY = 'concord:status';
const PRESENCES: Presence[] = ['Online', 'Idle', 'Focus', 'Busy', 'Invisible'];
export const parseStatus = (raw: string | undefined): Presence | null => (PRESENCES.includes(raw as Presence) ? (raw as Presence) : null);

/** Use counts kept for at most this many emoji, the most used. */
const USAGE_KEPT = 60;

export function parseEmojiPrefs(raw: string | undefined): EmojiPrefs {
  try {
    const v = JSON.parse(raw ?? '{}') as Partial<EmojiPrefs>;
    const favourites = Array.isArray(v.favourites) ? v.favourites.filter((x) => typeof x === 'string') : [];
    const usage: Record<string, number> = {};
    for (const [k, n] of Object.entries(v.usage ?? {})) if (typeof n === 'number' && n > 0) usage[k] = n;
    return { favourites, usage };
  } catch {
    return { favourites: [], usage: {} };
  }
}

export class Session {
  readonly store = new Store();
  readonly backend: Backend;
  readonly admin: ServerAdmin = new ServerAdmin(this);
  openServerId = $state<Id | null>(null);
  openChannelId = $state<Id | null>(null);
  private gateway: Gateway | null = null;
  private lastMemberFetch = new Map<Id, number>();
  private poll: ReturnType<typeof setInterval> | null = null;
  private clock: ReturnType<typeof setInterval> | null = null;
  private readonly messageListeners = new Set<(m: Message) => void>();
  private readonly onFocus = () => {
    void this.refreshMembers(false);
  };
  private emojiSave: ReturnType<typeof setTimeout> | null = null;
  /** When this client last changed its emoji prefs: a fetch started before then is older and is ignored. */
  private emojiChangedAt = 0;
  /** Per channel: when BeginTyping was last sent, and the timer that sends EndTyping. */
  private readonly typingState = new Map<Id, { began: number; stop: ReturnType<typeof setTimeout> | null }>();
  /** Synced settings as last fetched or pushed, by key. */
  private rawSettings: Record<string, { value: string }> = {};
  /** Profiles to fetch again shortly, after Stoat said they changed. */
  private readonly profileRefetch = new Map<Id, ReturnType<typeof setTimeout>>();
  private onSignedOut: () => void = () => {};
  /** Per channel: when the last ack was sent, what it was for, and a trailing ack waiting to go. */
  private readonly acks = new Map<Id, { at: number; sent?: Id | undefined; timer?: ReturnType<typeof setTimeout> | undefined }>();

  constructor(backend: Backend) {
    this.backend = backend;
  }

  /** Start with a stored or fresh session token. Throws if the token is no longer valid. */
  async start(token: string, onSignedOut: () => void): Promise<void> {
    this.onSignedOut = onSignedOut;
    this.backend.setToken(token);
    this.store.node = await this.backend.root();
    const self = await this.backend.self();
    this.store.self = self;
    this.store.upsertUsers([self]);
    this.gateway = this.backend.connect({
      onEvent: (event) => {
        if (event.type === 'messageCreate') {
          queueMicrotask(() => {
            for (const l of this.messageListeners) {
              try {
                l(event.message);
              } catch {
                // One listener failing, such as a browser refusing a notification, mustn't stop the others.
              }
            }
          });
        }
        let e = event;
        // A categories echo older than the order this session is writing would move the sidebar back.
        if (e.type === 'serverUpdate' && e.data.categories && this.admin.holdsCategories(e.id)) {
          const { categories: _, ...data } = e.data;
          e = { ...e, data };
        }
        // Likewise a role order older than the one being written.
        if (e.type === 'rolesReorder' && this.admin.holdsRanks(e.server)) return;
        // Read before the store forgets the server.
        const removal = this.removalOf(e);
        this.store.apply(e);
        this.follow(e);
        if (removal) {
          this.lastMemberFetch.delete(removal.server);
          for (const listener of this.removalListeners) listener(removal);
        }
      },
      onState: (s) => {
        this.store.connection = s;
        if (s === 'ready') void this.coldStart();
        if (s === 'invalid-session') void this.stop().then(() => this.onSignedOut());
      },
    });
    globalThis.addEventListener?.('focus', this.onFocus);
    this.clock = setInterval(() => (this.store.now = Date.now()), CLOCK_MS);
    if (!this.backend.capabilities.serverSubscribe) this.poll = setInterval(() => void this.refreshMembers(true), POLL_MS);
  }

  async stop(): Promise<void> {
    globalThis.removeEventListener?.('focus', this.onFocus);
    if (this.poll) clearInterval(this.poll);
    if (this.clock) clearInterval(this.clock);
    this.messageListeners.clear();
    for (const a of this.acks.values()) clearTimeout(a.timer);
    if (this.emojiSave) clearTimeout(this.emojiSave);
    this.emojiSave = null;
    for (const t of this.typingState.values()) if (t.stop) clearTimeout(t.stop);
    this.typingState.clear();
    for (const t of this.profileRefetch.values()) clearTimeout(t);
    this.profileRefetch.clear();
    for (const t of this.hiddenChecks.values()) clearTimeout(t);
    this.hiddenChecks.clear();
    this.rawSettings = {};
    this.selfQueue.clear();
    this.idle.stop();
    this.acks.clear();
    this.gateway?.close();
    this.gateway = null;
    this.store.clear();
  }

  async logout(): Promise<void> {
    await this.backend.logout();
    await this.stop();
  }

  /** After Ready: settings, the open server's members, and fresh history for the open channel. */
  private async coldStart(): Promise<void> {
    const fetchedAt = Date.now();
    const fetched = await this.backend.settings(['notifications', 'ordering', EMOJI_KEY, CLOSED_DMS_KEY, STATUS_KEY, ACTIVE_KEY]).catch(() => null);
    // A failed fetch keeps what this session has, rather than resetting the chosen status or favourites.
    if (!fetched) return this.coldStartRest();
    const settings: Record<string, { value: string }> = fetched;
    const active = Number(settings[ACTIVE_KEY]?.value);
    if (active) this.idle.remote(active);
    if (!this.statusSaving) this.store.chosenStatus = parseStatus(settings[STATUS_KEY]?.value);
    if (settings[CLOSED_DMS_KEY]) this.store.closedDms = parseClosedDms(settings[CLOSED_DMS_KEY].value);
    this.rawSettings = { ...this.rawSettings, ...settings };
    this.store.settings = parseSettings(this.rawSettings);
    if (this.emojiChangedAt < fetchedAt) this.store.emojiPrefs = parseEmojiPrefs(settings[EMOJI_KEY]?.value);
    await this.coldStartRest();
  }

  /** The open server's members and fresh history for the open channel. */
  private async coldStartRest(): Promise<void> {
    this.lastMemberFetch.clear();
    if (this.openServerId) {
      this.gateway?.subscribe(this.openServerId);
      await this.loadMembers(this.openServerId, true);
    }
    // Windows held across a disconnect may miss edits and deletes. Reload the open one where it was,
    // and drop the rest so they reload when opened.
    for (const channel of [...this.store.windows.keys()]) if (channel !== this.openChannelId) this.store.dropWindow(channel);
    if (this.openChannelId) await this.reloadWindow(this.openChannelId);
  }

  openServer(server: Id | null): void {
    this.openServerId = server;
    if (!server) return;
    this.gateway?.subscribe(server);
    void this.loadMembers(server, false);
  }

  async openChannel(channel: Id): Promise<void> {
    this.openChannelId = channel;
    if (!this.store.windows.has(channel)) await this.loadLatest(channel);
  }

  async loadMembers(server: Id, force: boolean): Promise<void> {
    const last = this.lastMemberFetch.get(server) ?? 0;
    if (!force && Date.now() - last < FOCUS_REFETCH_MS) return;
    this.lastMemberFetch.set(server, Date.now());
    const r = await this.backend.members(server);
    this.store.upsertUsers(r.users);
    this.store.upsertMembers(r.members);
    this.store.memberListLoaded.set(server, Date.now());
  }

  private async refreshMembers(force: boolean): Promise<void> {
    if (this.openServerId) await this.loadMembers(this.openServerId, force).catch(() => {});
  }

  async loadLatest(channel: Id): Promise<void> {
    const page = await this.backend.messages(channel, { limit: PAGE });
    this.absorb(page);
    const sorted = oldestFirst(page.messages);
    const newest = sorted.at(-1)?.id;
    // Messages that arrived over the socket while the page was in flight are newer than it: keep them.
    const w = this.store.windows.get(channel);
    const later = w?.atNewest
      ? w.ids.filter((id) => !newest || id > newest).map((id) => this.store.messages.get(id)).filter((m): m is Message => !!m)
      : [];
    this.store.setWindow(channel, [...sorted, ...later], { atNewest: true, atOldest: page.messages.length < PAGE });
  }

  async loadOlder(channel: Id): Promise<void> {
    const w = this.store.windows.get(channel);
    if (!w || w.atOldest || !w.ids.length) return;
    const page = await this.backend.messages(channel, { limit: PAGE, before: w.ids[0]! });
    this.absorb(page);
    this.store.prependPage(channel, oldestFirst(page.messages), page.messages.length < PAGE);
  }

  async loadNewer(channel: Id): Promise<void> {
    const w = this.store.windows.get(channel);
    if (!w || w.atNewest || !w.ids.length) return;
    // `after` alone returns the newest messages after the anchor; Oldest makes it the next page.
    const page = await this.backend.messages(channel, { limit: PAGE, after: w.ids[w.ids.length - 1]!, sort: 'Oldest' });
    this.absorb(page);
    this.store.appendPage(channel, oldestFirst(page.messages), page.messages.length < PAGE);
  }

  /** Replace the window with the history around one message. */
  async jumpTo(channel: Id, message: Id): Promise<void> {
    this.openChannelId = channel;
    const page = await this.backend.messages(channel, { limit: PAGE, nearby: message });
    this.absorb(page);
    const sorted = oldestFirst(page.messages);
    const c = this.store.channels.get(channel);
    const last = c && c.kind !== 'saved' ? c.lastMessageId : undefined;
    this.store.setWindow(channel, sorted, {
      atNewest: !!last && sorted.some((m) => m.id === last),
      atOldest: sorted.filter((m) => m.id < message).length < PAGE / 2 - 1,
    });
  }

  /** Profile fetches on their way, so callers asking at once share one request. */
  private readonly profileLoads = new Map<Id, Promise<void>>();

  /** A user's profile and mutual connections, fetched once per session and refreshed on request. */
  loadProfile(user: Id, refresh = false): Promise<void> {
    if (this.store.profiles.has(user) && !refresh) return Promise.resolve();
    const going = this.profileLoads.get(user);
    if (going) return going;
    const load = this.fetchProfile(user).finally(() => this.profileLoads.delete(user));
    this.profileLoads.set(user, load);
    return load;
  }

  private async fetchProfile(user: Id): Promise<void> {
    const [profile, mutual, fresh] = await Promise.all([
      this.backend.profile(user).catch(() => null),
      user === this.store.selfId ? Promise.resolve({ users: [], servers: [], channels: [] }) : this.backend.mutual(user).catch(() => ({ users: [], servers: [], channels: [] })),
      this.store.users.has(user) ? Promise.resolve(null) : this.backend.user(user).catch(() => null),
    ]);
    if (fresh) this.store.upsertUsers([fresh]);
    // A failed fetch keeps what is cached rather than blanking a bio and banner that were there.
    if (profile || !this.store.profiles.has(user)) this.store.profiles.set(user, profile ?? {});
    this.store.mutuals.set(user, mutual);
  }

  async jumpToPresent(channel: Id): Promise<void> {
    await this.loadLatest(channel);
    this.markRead(channel);
  }

  // ---------- sending (m2a-plan.md task 2) ----------

  /** Send a message optimistically. It shows at once as pending and is replaced when Stoat confirms it. */
  async send(channel: Id, content: string, replies: PendingMessage['replies'] = [], files: { file: Blob; name: string; preview?: string | undefined }[] = []): Promise<void> {
    // A message sent from older history would land outside the window, so go to the present first.
    if (!this.store.windows.get(channel)?.atNewest) await this.loadLatest(channel).catch(() => {});
    const key = ulid();
    this.store.ownNonces.add(key);
    const pendingFiles = files.map((f) => ({ file: f.file, name: f.name, size: f.file.size, preview: f.preview, progress: 0 }));
    this.store.pending.set(key, { key, channel, content, replies, attachments: [], files: pendingFiles, state: 'sending' });
    await this.deliver(key);
  }

  /** Upload a pending message's files that have no ID yet, updating their progress. Throws if any failed. */
  private async uploadFiles(key: Id): Promise<void> {
    const update = (i: number, change: Partial<PendingMessage['files'][number]>) => {
      const p = this.store.pending.get(key);
      if (!p) return;
      this.store.pending.set(key, { ...p, files: p.files.map((f, j) => (j === i ? { ...f, ...change } : f)) });
    };
    const p = this.store.pending.get(key);
    // Wait for every upload to finish before failing, so a quick retry never uploads a file that is still going.
    const results = await Promise.allSettled((p?.files ?? []).map(async (f, i) => {
      if (f.id) return;
      const id = await this.backend.upload(f.file, f.name, (progress) => update(i, { progress }));
      update(i, { id, progress: 1 });
    }));
    const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed) throw failed.reason;
  }

  /** Try a failed message again with the same key, so Stoat can't store it twice. */
  retry(key: Id): Promise<void> {
    const p = this.store.pending.get(key);
    if (!p || p.state !== 'failed') return Promise.resolve();
    this.store.pending.set(key, { key, channel: p.channel, content: p.content, replies: p.replies, attachments: p.attachments, files: p.files, state: 'sending' });
    return this.deliver(key);
  }

  discard(key: Id): void {
    this.store.pending.delete(key);
  }

  private async deliver(key: Id): Promise<void> {
    let p = this.store.pending.get(key);
    if (!p) return;
    const channel = p.channel;
    try {
      if (p.files.some((f) => !f.id)) {
        await this.uploadFiles(key);
        p = this.store.pending.get(key);
        if (!p) return;
      }
      const attachments = [...p.attachments, ...p.files.map((f) => f.id!)];
      const message = await this.backend.sendMessage(p.channel, { content: p.content, replies: p.replies, attachments }, key);
      this.store.apply({ type: 'messageCreate', message });
      // Read up to this message only: if the user has moved on, newer messages here stay unread.
      this.markRead(channel, message.id);
    } catch (e) {
      if (e instanceof BackendError && e.status === 409) {
        // The key was used: an earlier attempt reached Stoat after all. The newest page holds it.
        try {
          await this.loadLatest(channel);
        } catch {
          const now = this.store.pending.get(key);
          if (now) this.store.pending.set(key, { ...now, state: 'failed', error: 'network' });
          return;
        }
        const real = [...this.store.messages.values()].find((m) => m.nonce === key);
        this.store.pending.delete(key);
        if (real) this.markRead(channel, real.id);
        return;
      }
      const error = e instanceof BackendError ? e.kind : 'network';
      const now = this.store.pending.get(key);
      if (now) this.store.pending.set(key, { ...now, state: 'failed', error });
    }
  }

  // ---------- edit, delete, pin (m2a-plan.md task 3) ----------

  /** Edit optimistically. On failure the old text comes back, unless something newer replaced it, and this throws. */
  async editMessage(channel: Id, id: Id, content: string): Promise<void> {
    const before = this.store.messages.get(id);
    if (!before || before.content === content) return;
    this.store.messages.set(id, { ...before, content, edited: new Date().toISOString() });
    try {
      const m = await this.backend.editMessage(channel, id, content);
      this.store.apply({ type: 'messageUpdate', id, channel, data: { ...(m.content !== undefined ? { content: m.content } : {}), ...(m.edited ? { edited: m.edited } : {}) }, clear: [] });
    } catch (e) {
      const now = this.store.messages.get(id);
      if (now?.content === content) {
        const { content: _c, edited: _e, ...rest } = now;
        this.store.messages.set(id, { ...rest, ...(before.content !== undefined ? { content: before.content } : {}), ...(before.edited ? { edited: before.edited } : {}) });
      }
      throw e;
    }
  }

  /** Delete optimistically. On failure the message comes back where it was, and this throws. */
  async deleteMessage(channel: Id, id: Id): Promise<void> {
    const before = this.store.messages.get(id);
    const inWindow = !!this.store.windows.get(channel)?.ids.includes(id);
    this.store.apply({ type: 'messageDelete', id, channel });
    try {
      await this.backend.deleteMessage(channel, id);
    } catch (e) {
      // Already gone at Stoat: the delete happened, just not by us.
      if (e instanceof BackendError && e.kind === 'NotFound') return;
      if (before) this.store.restoreMessage(before, inWindow);
      throw e;
    }
  }

  /** Pin or unpin. Stoat's echo updates the message, and its system message says who did it. */
  pinMessage(channel: Id, id: Id, pinned: boolean): Promise<void> {
    return this.backend.pinMessage(channel, id, pinned);
  }

  // ---------- reactions and emoji (m2a-plan.md task 4) ----------

  /** Add or remove this account's reaction, optimistically. On failure it reverts and this throws. */
  async react(channel: Id, id: Id, emoji: string): Promise<void> {
    const self = this.store.selfId;
    const m = this.store.messages.get(id);
    if (!self || !m) return;
    const add = !m.reactions[emoji]?.includes(self);
    const limit = this.store.node?.limits.reactions ?? 20;
    if (add && !m.reactions[emoji] && Object.keys(m.reactions).length >= limit) throw new Error('reaction limit');
    const apply = (on: boolean) => this.store.apply({ type: on ? 'reactionAdd' : 'reactionRemove', id, channel, user: self, emoji });
    apply(add);
    try {
      await this.backend.react(channel, id, emoji, add);
    } catch (e) {
      apply(!add);
      throw e;
    }
  }

  /** Count a use of an emoji, for "frequently used". Saved shortly after, so a burst is one write. */
  useEmoji(key: string): void {
    const usage = { ...this.store.emojiPrefs.usage, [key]: (this.store.emojiPrefs.usage[key] ?? 0) + 1 };
    const kept = Object.entries(usage).sort((a, b) => b[1] - a[1]).slice(0, USAGE_KEPT);
    this.store.emojiPrefs = { ...this.store.emojiPrefs, usage: Object.fromEntries(kept) };
    this.saveEmojiPrefs();
  }

  toggleFavourite(key: string): void {
    const fav = this.store.emojiPrefs.favourites;
    this.store.emojiPrefs = { ...this.store.emojiPrefs, favourites: fav.includes(key) ? fav.filter((k) => k !== key) : [...fav, key] };
    this.saveEmojiPrefs();
  }

  private saveEmojiPrefs(): void {
    this.emojiChangedAt = Date.now();
    if (this.emojiSave) clearTimeout(this.emojiSave);
    this.emojiSave = setTimeout(() => {
      this.emojiSave = null;
      void this.backend.setSettings({ [EMOJI_KEY]: JSON.stringify(this.store.emojiPrefs) }).catch(() => {});
    }, 2_000);
  }

  // ---------- events the store can't handle alone ----------

  private readonly removalListeners = new Set<(r: ServerRemoval) => void>();
  /** Servers this session is leaving or deleting itself, so their removal isn't announced as someone else's doing. */
  readonly ownRemovals = new Set<Id>();

  /** Called whenever this account loses a server. Returns the call that stops it. */
  onServerRemoved(listener: (r: ServerRemoval) => void): () => void {
    this.removalListeners.add(listener);
    return () => this.removalListeners.delete(listener);
  }

  private removalOf(e: DomainEvent): ServerRemoval | null {
    let server: Id;
    let reason: ServerRemoval['reason'];
    if (e.type === 'memberLeave' && e.user === this.store.selfId) {
      server = e.server;
      reason = e.reason === 'Kick' ? 'kicked' : e.reason === 'Ban' ? 'banned' : 'left';
    } else if (e.type === 'serverDelete') {
      server = e.id;
      reason = 'deleted';
    } else return null;
    const s = this.store.servers.get(server);
    if (!s) return null;
    if (this.ownRemovals.delete(server)) reason = 'left';
    return { server, name: s.name, reason };
  }

  private follow(e: DomainEvent): void {
    switch (e.type) {
      case 'groupJoin':
        // Stoat sends only IDs: fetch members this account hasn't met.
        return this.meet([e.user]);
      case 'memberUpdate':
        if (e.user === this.store.selfId && ('roles' in e.data || e.clear.includes('roles'))) this.recheckHidden(e.server);
        return;
      case 'roleUpdate':
        if ('permissions' in e.data && this.store.members.get(memberKey(e.server, this.store.selfId ?? ''))?.roles.includes(e.id)) this.recheckHidden(e.server);
        return;
      case 'serverUpdate':
        if ('defaultPermissions' in e.data) this.recheckHidden(e.id);
        return;
      case 'serverCreate': {
        // Joining or creating a server brings no member record of your own, and without it every channel
        // looks hidden (m2c-plan.md).
        const self = this.store.selfId;
        if (self && !this.store.members.has(memberKey(e.server.id, self))) {
          void this.backend.member(e.server.id, self).then((m) => this.store.upsertMembers([m])).catch(() => {});
        }
        return;
      }
      case 'channelCreate':
        if (e.channel.kind === 'dm' || e.channel.kind === 'group') this.meet(e.channel.recipients);
        return;
      case 'userUpdate':
        if (e.id === this.store.selfId && ('presence' in e.data || e.clear.includes('presence'))) this.idle.presenceChanged();
        // Stoat never says whether the bio or banner changed: an edit that also changes the name or status
        // carries only those. So anything but a bare online flag may have changed the profile.
        if (Object.keys(e.data).some((k) => k !== 'online') || e.clear.length) this.profileChanged(e.id);
        return;
      case 'profileChanged':
        return this.profileChanged(e.id);
      case 'settings':
        return this.settingsChanged(e.values);
      case 'voiceJoin':
      case 'voiceMove':
        // Anyone who can see a channel sees who joins it, including people this session hasn't met.
        return this.meetInVoice(e.state.user, e.state.channel);
    }
  }

  private readonly hiddenChecks = new Map<Id, ReturnType<typeof setTimeout>>();

  /**
   * Fetch the channels of a server this session doesn't have, after a change that may have let it see them.
   * Stoat's socket loses track of a channel that was hidden from it right after it was created, and then
   * sends no `ChannelCreate` when a role later shows it (m2c-results.md task 5, checked live). A channel still
   * hidden answers 403 and is skipped.
   */
  private recheckHidden(server: Id): void {
    const pending = this.hiddenChecks.get(server);
    if (pending) clearTimeout(pending);
    this.hiddenChecks.set(server, setTimeout(() => {
      this.hiddenChecks.delete(server);
      for (const id of this.store.servers.get(server)?.channels ?? []) {
        if (this.store.channels.has(id)) continue;
        void this.backend.channel(id).then((channel) => {
          if (!this.store.channels.has(id)) this.store.apply({ type: 'channelCreate', channel });
        }).catch((e: unknown) => {
          // Gone for everyone: Stoat sends no server update when a channel is deleted, so forget its ID here.
          const s = this.store.servers.get(server);
          if (e instanceof BackendError && e.status === 404 && s) this.store.servers.set(server, { ...s, channels: s.channels.filter((c) => c !== id) });
        });
      }
    }, 500));
  }

  private meet(users: Id[]): void {
    for (const id of users) if (!this.store.users.has(id)) void this.backend.user(id).then((u) => this.store.upsertUsers([u])).catch(() => {});
  }

  private readonly voiceMemberFetches = new Set<string>();

  /** A voice joiner's user, and in a server their member record, which holds a server mute or deafen. */
  private meetInVoice(user: Id, channel: Id): void {
    this.meet([user]);
    const c = this.store.channels.get(channel);
    if (c?.kind !== 'text') return;
    const key = memberKey(c.server, user);
    if (this.store.members.has(key) || this.voiceMemberFetches.has(key)) return;
    this.voiceMemberFetches.add(key);
    void this.backend.member(c.server, user).then((m) => this.store.upsertMembers([m])).catch(() => {})
      .finally(() => this.voiceMemberFetches.delete(key));
  }

  /** Fetch a changed profile again, but only if this session has shown it. A burst of changes is one fetch. */
  private profileChanged(user: Id): void {
    if (!this.watchedProfiles.has(user) || this.profileRefetch.has(user)) return;
    this.profileRefetch.set(user, setTimeout(() => {
      this.profileRefetch.delete(user);
      // Only the profile itself: a status change mustn't cost mutual lookups too, in the shared users bucket.
      void this.backend.profile(user).then((p) => this.store.profiles.set(user, p)).catch(() => {});
    }, 300));
  }

  /** Profiles on screen now, with how many places show each. Only these are fetched again live. */
  private readonly watchedProfiles = new Map<Id, number>();

  /**
   * A profile is on screen: changes to it are fetched live while it stays there. Every server is
   * subscribed, so refetching every cached profile on every status change would cost real load at M3.
   * Returns the call that ends it.
   */
  watchProfile(user: Id): () => void {
    this.watchedProfiles.set(user, (this.watchedProfiles.get(user) ?? 0) + 1);
    return () => {
      const n = (this.watchedProfiles.get(user) ?? 1) - 1;
      if (n > 0) this.watchedProfiles.set(user, n);
      else this.watchedProfiles.delete(user);
    };
  }

  /**
   * Settings written by any session of this account, this one's own writes included. A local change still
   * waiting to be saved is newer than any echo, so it is kept.
   */
  private settingsChanged(values: Record<string, { value: string }>): void {
    this.rawSettings = { ...this.rawSettings, ...values };
    if ('notifications' in values || 'ordering' in values) {
      const next = parseSettings(this.rawSettings);
      // A change of ours still on its way, or just written, is newer than this echo. Look again once the
      // hold ends, in case a change from another device came in meanwhile.
      if (this.notificationWrites.holding) {
        next.notifications = this.store.settings.notifications;
        setTimeout(() => {
          if (!this.notificationWrites.holding) this.store.settings = { ...this.store.settings, notifications: parseSettings(this.rawSettings).notifications };
        }, HOLD_MS + 100);
      }
      this.store.settings = next;
    }
    if (values[EMOJI_KEY] && !this.emojiSave) this.store.emojiPrefs = parseEmojiPrefs(values[EMOJI_KEY].value);
    if (values[CLOSED_DMS_KEY] && !this.closedSaving) this.store.closedDms = parseClosedDms(values[CLOSED_DMS_KEY].value);
    if (values[STATUS_KEY] && !this.statusSaving) this.store.chosenStatus = parseStatus(values[STATUS_KEY].value);
    // Another device was used, or this one's own write came back: either way, someone is here.
    if (values[ACTIVE_KEY]) this.idle.remote();
  }

  // ---------- notifications (m2c-plan.md task 8) ----------

  /** Called after every new message is applied, for the notifier. Returns the call that stops it. */
  onMessage(listener: (m: Message) => void): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  private readonly notificationWrites = new Latest<NotificationSettings>(async (next) => {
    const value = writeNotifications(this.rawSettings.notifications?.value, next);
    await this.backend.setSettings({ notifications: value });
    this.rawSettings = { ...this.rawSettings, notifications: { value } };
  });

  private changeNotifications(change: (n: NotificationSettings) => void): Promise<void> {
    // From the newest local value, so two quick changes both survive.
    const next = structuredClone($state.snapshot(this.store.settings.notifications)) as NotificationSettings;
    change(next);
    this.store.settings = { ...this.store.settings, notifications: next };
    return this.notificationWrites.set(next).catch((e: unknown) => {
      // Not saved: show what is stored, unless a newer change of ours is already on its way.
      if (!this.notificationWrites.holding) this.store.settings = { ...this.store.settings, notifications: parseSettings(this.rawSettings).notifications };
      throw e;
    });
  }

  /** A server's or channel's level, or null to go back to the default. */
  setNotificationLevel(scope: 'server' | 'channel', id: Id, level: NotificationLevel | null): Promise<void> {
    return this.changeNotifications((n) => {
      const map = scope === 'server' ? n.server : n.channel;
      if (level) map[id] = level;
      else delete map[id];
    });
  }

  /** Mute for some minutes, or until turned off with null; unmute with `false`. */
  setMute(scope: 'server' | 'channel', id: Id, minutes: number | null | false): Promise<void> {
    return this.changeNotifications((n) => {
      const map = scope === 'server' ? n.serverMutes : n.channelMutes;
      if (minutes === false) delete map[id];
      else map[id] = minutes === null ? {} : { until: Date.now() + minutes * 60_000 };
    });
  }

  // ---------- friends (m2b-plan.md task 2) ----------

  /** Send a friend request by `name#1234`. Not optimistic: the user is unknown until Stoat finds them. */
  async addFriend(tag: string): Promise<User> {
    const user = await this.backend.addFriend(tag);
    this.store.apply({ type: 'relationship', user, status: user.relationship });
    return user;
  }

  /** Send a friend request to someone already known by ID, such as from their profile. */
  requestFriend(user: Id): Promise<void> {
    return this.relate(user, 'Outgoing', () => this.backend.acceptFriend(user));
  }

  acceptFriend(user: Id): Promise<void> {
    return this.relate(user, 'Friend', () => this.backend.acceptFriend(user));
  }

  /** Ignore or cancel a request, or remove a friend. */
  removeFriend(user: Id): Promise<void> {
    return this.relate(user, 'None', () => this.backend.removeFriend(user));
  }

  block(user: Id): Promise<void> {
    return this.relate(user, 'Blocked', () => this.backend.block(user));
  }

  unblock(user: Id): Promise<void> {
    return this.relate(user, 'None', () => this.backend.unblock(user));
  }

  /**
   * Change a relationship optimistically. Stoat's answer, or its event, settles it. On failure the old one
   * comes back, unless something newer replaced it meanwhile, and this throws.
   */
  private async relate(user: Id, next: Relationship, call: () => Promise<User>): Promise<void> {
    const before = this.store.users.get(user);
    if (before) this.store.upsertUsers([{ ...before, relationship: next }]);
    try {
      const u = await call();
      this.store.apply({ type: 'relationship', user: u, status: u.relationship });
    } catch (e) {
      const now = this.store.users.get(user);
      if (before && now?.relationship === next) this.store.upsertUsers([{ ...now, relationship: before.relationship }]);
      throw e;
    }
  }

  /** The DM channel with a user, opened at Stoat if needed, and shown again if it was closed. Returns its ID. */
  async openDm(user: Id): Promise<Id> {
    const known = [...this.store.channels.values()].find((c) => c.kind === 'dm' && c.recipients.includes(user));
    let id = known?.id;
    if (!id) {
      const channel = await this.backend.openDm(user);
      if (!this.store.channels.has(channel.id)) this.store.apply({ type: 'channelCreate', channel });
      id = channel.id;
    }
    if (id in this.store.closedDms) this.setClosed(id, null);
    return id;
  }

  /** Hide a DM for this account only. It comes back with a newer message, or when opened again. */
  closeDm(channel: Id): void {
    const c = this.store.channels.get(channel);
    if (c?.kind !== 'dm') return;
    this.setClosed(channel, c.lastMessageId ?? '');
  }

  /** Whether a closed-DMs write is on its way, so its echo, or an older one, doesn't undo a newer change. */
  private closedSaving = 0;

  private setClosed(channel: Id, upTo: Id | null): void {
    const next = { ...this.store.closedDms };
    delete next[channel];
    if (upTo !== null) next[channel] = upTo;
    // Keep the most recently closed: the newest message IDs, or empty DMs, last.
    const kept = Object.entries(next).sort((a, b) => (a[1] || '~').localeCompare(b[1] || '~')).slice(-CLOSED_KEPT);
    this.store.closedDms = Object.fromEntries(kept);
    this.closedSaving++;
    void this.backend.setSettings({ [CLOSED_DMS_KEY]: JSON.stringify(this.store.closedDms) }).catch(() => {}).finally(() => {
      // The echo arrives about when the request returns: let a moment pass before trusting events again.
      setTimeout(() => this.closedSaving--, 1_000);
    });
  }

  // ---------- status and profile (m2b-plan.md tasks 5 and 7) ----------

  readonly selfQueue = new SelfQueue((edit) => this.writeSelf(edit));

  /** Automatic idle. The web layer feeds it input and starts it in the one tab that holds the idle lock. */
  readonly idle = new IdleTracker({
    now: () => Date.now(),
    presence: () => {
      const self = this.store.self;
      // Your own Invisible shows in Stoat's data only as offline.
      return self?.presence ?? (self && !self.online ? 'Invisible' : undefined);
    },
    chosen: () => this.store.chosenStatus,
    setPresence: (presence) => void this.editSelf({ presence }).catch(() => {}),
    writeActive: (at) => void this.backend.setSettings({ [ACTIVE_KEY]: String(at) }).catch(() => {}),
    inCall: () => {
      const self = this.store.selfId;
      return !!self && this.store.voiceChannelOf(self) !== undefined;
    },
  });
  private statusSaving = 0;

  /**
   * Choose a status in the menu. The choice is saved first, so another device never takes the new presence
   * for an automatic one, then the presence goes through the queue.
   */
  async setStatus(presence: Presence): Promise<void> {
    const before = this.store.chosenStatus;
    this.store.chosenStatus = presence;
    this.statusSaving++;
    try {
      await this.backend.setSettings({ [STATUS_KEY]: presence });
      await this.editSelf({ presence });
    } catch (e) {
      // Not applied: the choice goes back, here and for other devices.
      if (this.store.chosenStatus === presence) {
        this.store.chosenStatus = before;
        void this.backend.setSettings({ [STATUS_KEY]: before ?? 'Online' }).catch(() => {});
      }
      throw e;
    } finally {
      setTimeout(() => this.statusSaving--, 1_000);
    }
  }

  /** Set the custom status text, or clear it with null. */
  setStatusText(text: string | null): Promise<void> {
    return this.editSelf(text ? { statusText: text } : { remove: ['statusText'] });
  }

  /**
   * Change this account's user or profile: shown at once, then written through the queue. If Stoat refuses,
   * the user is fetched again so the screen matches it, and this throws.
   */
  async editSelf(change: SelfEdit): Promise<void> {
    this.applySelf(change);
    try {
      await this.selfQueue.push(change);
    } catch (e) {
      const fresh = await this.backend.self().catch(() => null);
      if (fresh) this.store.upsertUsers([fresh]);
      throw e;
    }
  }

  private applySelf(change: SelfEdit): void {
    const self = this.store.self;
    if (!self) return;
    const next: User = { ...self };
    if (change.presence) {
      next.presence = change.presence;
      if (change.presence !== 'Invisible') next.online = true;
    }
    if (change.statusText !== undefined) next.statusText = change.statusText;
    if (change.displayName !== undefined) next.displayName = change.displayName;
    if (change.pronouns !== undefined) next.pronouns = change.pronouns;
    const own: Partial<Record<NonNullable<SelfEdit['remove']>[number], keyof User>> = {
      displayName: 'displayName', pronouns: 'pronouns', avatar: 'avatar', statusText: 'statusText', presence: 'presence',
    };
    for (const f of change.remove ?? []) if (own[f]) delete next[own[f]];
    this.store.upsertUsers([next]);
  }

  /** One queued write. Stoat's answer brings the uploaded avatar; its status is left to events, since it hides Invisible. */
  private async writeSelf(edit: SelfEdit): Promise<void> {
    const u = await this.backend.editSelf(edit);
    const self = this.store.self;
    if (self) {
      const next: User = { ...self };
      for (const k of ['displayName', 'pronouns', 'avatar'] as const) {
        if (u[k] !== undefined) (next as unknown as Record<string, unknown>)[k] = u[k];
        else delete next[k];
      }
      this.store.upsertUsers([next]);
    }
    if (edit.bio !== undefined || edit.banner !== undefined || edit.remove?.some((f) => f === 'bio' || f === 'banner')) {
      await this.loadProfile(self?.id ?? '', true).catch(() => {});
    }
  }

  // ---------- groups (m2b-plan.md task 4) ----------

  /** Create a group with friends. Returns its ID. */
  async createGroup(name: string, users: Id[]): Promise<Id> {
    const channel = await this.backend.createGroup(name, users);
    if (!this.store.channels.has(channel.id)) this.store.apply({ type: 'channelCreate', channel });
    return channel.id;
  }

  /** Add friends one at a time, as Stoat takes them. Stops at the first refusal and throws it. */
  async addGroupMembers(group: Id, users: Id[]): Promise<void> {
    for (const user of users) await this.backend.addGroupMember(group, user);
  }

  removeGroupMember(group: Id, user: Id): Promise<void> {
    return this.backend.removeGroupMember(group, user);
  }

  /** Leave a group. It disappears here at once. */
  async leaveGroup(group: Id): Promise<void> {
    await this.backend.leaveGroup(group);
    this.store.forgetChannel(group);
  }

  async editGroup(group: Id, change: GroupEdit): Promise<void> {
    const channel = await this.backend.editGroup(group, change);
    const old = this.store.channels.get(group);
    // The answer is the whole group as it is now; only the newest message may be newer here.
    if (old?.kind === 'group' && channel.kind === 'group') {
      this.store.channels.set(group, old.lastMessageId && !newer(channel.lastMessageId, old.lastMessageId) ? { ...channel, lastMessageId: old.lastMessageId } : channel);
    }
  }

  /** How many outgoing friend requests this account may have waiting. */
  friendRequestLimit(): number {
    const limits = this.store.node?.social.friendRequests;
    const self = this.store.selfId;
    if (!limits || !self) return 10;
    const ageHours = (Date.now() - ulidTime(self)) / 3_600_000;
    return ageHours < limits.newUserHours ? limits.newUser : limits.other;
  }

  // ---------- pins and search (m2a-plan.md task 8) ----------

  /**
   * A page of search results, newest first. The messages stay out of the store's windows: the results
   * panel keeps them, and reads newer copies from the store when they are loaded there.
   */
  async search(channel: Id, q: Pick<SearchQuery, 'query' | 'pinned' | 'before'>, limit = 50): Promise<Message[]> {
    const page = await this.backend.search(channel, { ...q, limit, sort: 'Latest' });
    this.absorb(page);
    return [...page.messages].sort((a, b) => (a.id < b.id ? 1 : -1));
  }

  // ---------- typing (m2a-plan.md task 7) ----------

  /** Called on each edit of a non-empty draft. Sends BeginTyping at most every 2.5 s, and EndTyping after 1 s of quiet. */
  typing(channel: Id): void {
    const t = this.typingState.get(channel) ?? { began: 0, stop: null };
    this.typingState.set(channel, t);
    if (Date.now() - t.began >= TYPING_EVERY_MS) {
      t.began = Date.now();
      this.gateway?.typing(channel, true);
    }
    if (t.stop) clearTimeout(t.stop);
    t.stop = setTimeout(() => this.stopTyping(channel), TYPING_STOP_MS);
  }

  /** On send, on clearing the draft, and after a pause. */
  stopTyping(channel: Id): void {
    const t = this.typingState.get(channel);
    if (!t) return;
    if (t.stop) clearTimeout(t.stop);
    this.typingState.delete(channel);
    this.gateway?.typing(channel, false);
  }

  // ---------- acks ----------

  /**
   * Mark a channel read up to its newest message: locally at once, and to Stoat at most once per channel
   * every ACK_EVERY_MS, with a trailing ack for the newest message when several arrive in that time.
   */
  markRead(channel: Id, upTo?: Id): void {
    const c = this.store.channels.get(channel);
    const target = upTo ?? (c && c.kind !== 'saved' ? c.lastMessageId : undefined);
    if (!target) return;
    this.store.markRead(channel, target);
    const a = this.acks.get(channel) ?? { at: 0 };
    this.acks.set(channel, a);
    if (a.sent === this.store.unreads.get(channel)?.lastId || a.timer) return;
    const wait = a.at + ACK_EVERY_MS - Date.now();
    if (wait <= 0) return this.flushAck(channel);
    a.timer = setTimeout(() => this.flushAck(channel), wait);
  }

  private flushAck(channel: Id): void {
    const a = this.acks.get(channel);
    if (!a) return;
    // Left or deleted meanwhile, such as a group: nothing to read.
    if (!this.store.channels.has(channel)) return void this.acks.delete(channel);
    a.timer = undefined;
    // The read point as it is now, which may be newer than when the ack was scheduled.
    const target = this.store.unreads.get(channel)?.lastId;
    if (!target || target === a.sent) return;
    a.at = Date.now();
    a.sent = target;
    void this.backend.ack(channel, target).catch(() => {
      // The local read point already hides the marker, so nothing else would send this again: retry.
      if (a.sent === target) a.sent = undefined;
      if (!a.timer && this.acks.get(channel) === a) a.timer = setTimeout(() => this.flushAck(channel), ACK_RETRY_MS);
    });
  }

  private async reloadWindow(channel: Id): Promise<void> {
    const w = this.store.windows.get(channel);
    if (!w || w.atNewest || !w.ids.length) return this.loadLatest(channel);
    return this.jumpTo(channel, w.ids[Math.floor(w.ids.length / 2)]!);
  }

  private absorb(page: { users: Parameters<Store['upsertUsers']>[0]; members: Parameters<Store['upsertMembers']>[0] }): void {
    this.store.upsertUsers(page.users);
    this.store.upsertMembers(page.members);
  }
}
