/**
 * One signed-in session: connects the backend to the store and runs the cold start after every connect
 * (architecture section 4.3). Commands the UI calls live here; M2 adds the write actions.
 */
import type { Backend, Gateway } from './backend.ts';
import type { Id, Message } from './entities.ts';
import { BackendError } from './errors.ts';
import { Store, type EmojiPrefs, type NotificationLevel, type PendingMessage, type Settings } from './store/store.svelte.ts';
import { ulid } from './ulid.ts';

const PAGE = 100;
const FOCUS_REFETCH_MS = 60_000;
/** Typing timing from Stoat's own client: start at most this often, and stop after this long without input. */
export const TYPING_EVERY_MS = 2_500;
export const TYPING_STOP_MS = 1_000;
/** At most one ack per channel in this time (m2a-plan.md decision 5). */
export const ACK_EVERY_MS = 2_000;
const POLL_MS = 2 * 60_000;

const oldestFirst = (list: Message[]) => [...list].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

export function parseSettings(raw: Record<string, { value: string }>): Settings {
  const out: Settings = { servers: {}, channels: {}, serverOrder: [] };
  const levels = new Set<NotificationLevel>(['all', 'mention', 'none', 'muted']);
  try {
    const n = JSON.parse(raw.notifications?.value ?? '{}') as { server?: Record<Id, string>; channel?: Record<Id, string> };
    for (const [id, v] of Object.entries(n.server ?? {})) if (levels.has(v as NotificationLevel)) out.servers[id] = v as NotificationLevel;
    for (const [id, v] of Object.entries(n.channel ?? {})) if (levels.has(v as NotificationLevel)) out.channels[id] = v as NotificationLevel;
  } catch {
    // Settings written by another client in a shape we don't know: keep the defaults.
  }
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
  openServerId = $state<Id | null>(null);
  openChannelId = $state<Id | null>(null);
  private gateway: Gateway | null = null;
  private lastMemberFetch = new Map<Id, number>();
  private poll: ReturnType<typeof setInterval> | null = null;
  private readonly onFocus = () => {
    void this.refreshMembers(false);
    void this.refreshEmojiPrefs();
  };
  private emojiSave: ReturnType<typeof setTimeout> | null = null;
  /** Per channel: when BeginTyping was last sent, and the timer that sends EndTyping. */
  private readonly typingState = new Map<Id, { began: number; stop: ReturnType<typeof setTimeout> | null }>();
  private emojiFetchedAt = 0;
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
      onEvent: (e) => this.store.apply(e),
      onState: (s) => {
        this.store.connection = s;
        if (s === 'ready') void this.coldStart();
        if (s === 'invalid-session') void this.stop().then(() => this.onSignedOut());
      },
    });
    globalThis.addEventListener?.('focus', this.onFocus);
    if (!this.backend.capabilities.serverSubscribe) this.poll = setInterval(() => void this.refreshMembers(true), POLL_MS);
  }

  async stop(): Promise<void> {
    globalThis.removeEventListener?.('focus', this.onFocus);
    if (this.poll) clearInterval(this.poll);
    for (const a of this.acks.values()) clearTimeout(a.timer);
    if (this.emojiSave) clearTimeout(this.emojiSave);
    this.emojiSave = null;
    for (const t of this.typingState.values()) if (t.stop) clearTimeout(t.stop);
    this.typingState.clear();
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
    const settings: Record<string, { value: string }> = await this.backend.settings(['notifications', 'ordering', EMOJI_KEY]).catch(() => ({}));
    this.store.settings = parseSettings(settings);
    if (!this.emojiSave) this.store.emojiPrefs = parseEmojiPrefs(settings[EMOJI_KEY]?.value);
    this.emojiFetchedAt = Date.now();
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
    this.store.setWindow(channel, oldestFirst(page.messages), { atNewest: true, atOldest: page.messages.length < PAGE });
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

  /** A user's profile and mutual connections, fetched once per session and refreshed on request. */
  async loadProfile(user: Id, refresh = false): Promise<void> {
    if (this.store.profiles.has(user) && !refresh) return;
    const [profile, mutual, fresh] = await Promise.all([
      this.backend.profile(user).catch(() => ({})),
      user === this.store.selfId ? Promise.resolve({ users: [], servers: [], channels: [] }) : this.backend.mutual(user).catch(() => ({ users: [], servers: [], channels: [] })),
      this.store.users.has(user) ? Promise.resolve(null) : this.backend.user(user).catch(() => null),
    ]);
    if (fresh) this.store.upsertUsers([fresh]);
    this.store.profiles.set(user, profile);
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

  /** Upload a pending message's files that have no ID yet, updating their progress. Throws on the first failure. */
  private async uploadFiles(key: Id): Promise<void> {
    const update = (i: number, change: Partial<PendingMessage['files'][number]>) => {
      const p = this.store.pending.get(key);
      if (!p) return;
      this.store.pending.set(key, { ...p, files: p.files.map((f, j) => (j === i ? { ...f, ...change } : f)) });
    };
    const p = this.store.pending.get(key);
    await Promise.all((p?.files ?? []).map(async (f, i) => {
      if (f.id) return;
      const id = await this.backend.upload(f.file, f.name, (progress) => update(i, { progress }));
      update(i, { id, progress: 1 });
    }));
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
      this.markRead(p.channel);
    } catch (e) {
      if (e instanceof BackendError && e.status === 409) {
        // The key was used: an earlier attempt reached Stoat after all. The newest page holds it.
        await this.loadLatest(channel).catch(() => {});
        this.store.pending.delete(key);
        this.markRead(channel);
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
    if (this.emojiSave) clearTimeout(this.emojiSave);
    this.emojiSave = setTimeout(() => {
      this.emojiSave = null;
      void this.backend.setSettings({ [EMOJI_KEY]: JSON.stringify(this.store.emojiPrefs) }).catch(() => {});
    }, 2_000);
  }

  /** Stoat sends no event when settings change, so other devices' changes arrive on focus. */
  private async refreshEmojiPrefs(): Promise<void> {
    if (this.emojiSave || Date.now() - this.emojiFetchedAt < FOCUS_REFETCH_MS / 6) return;
    this.emojiFetchedAt = Date.now();
    const s = await this.backend.settings([EMOJI_KEY]).catch(() => null);
    if (s && !this.emojiSave) this.store.emojiPrefs = parseEmojiPrefs(s[EMOJI_KEY]?.value);
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
  markRead(channel: Id): void {
    const c = this.store.channels.get(channel);
    const last = c && c.kind !== 'saved' ? c.lastMessageId : undefined;
    if (!last) return;
    this.store.markRead(channel, last);
    const a = this.acks.get(channel) ?? { at: 0 };
    this.acks.set(channel, a);
    if (a.sent === last || a.timer) return;
    const wait = a.at + ACK_EVERY_MS - Date.now();
    if (wait <= 0) return this.flushAck(channel);
    a.timer = setTimeout(() => this.flushAck(channel), wait);
  }

  private flushAck(channel: Id): void {
    const a = this.acks.get(channel);
    if (!a) return;
    a.timer = undefined;
    const c = this.store.channels.get(channel);
    const last = c && c.kind !== 'saved' ? c.lastMessageId : undefined;
    const target = last && this.store.unreads.get(channel)?.lastId === last ? last : undefined;
    if (!target || target === a.sent) return;
    a.at = Date.now();
    a.sent = target;
    void this.backend.ack(channel, target).catch(() => {
      // Lost ack: the next markRead tries again.
      if (a.sent === target) a.sent = undefined;
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
