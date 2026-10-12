/**
 * One signed-in session: connects the backend to the store and runs the cold start after every connect
 * (architecture section 4.3). Commands the UI calls live here; M2 adds the write actions.
 */
import type { Backend, Gateway } from './backend.ts';
import type { Id, Message } from './entities.ts';
import { Store, type NotificationLevel, type Settings } from './store/store.svelte.ts';

const PAGE = 100;
const FOCUS_REFETCH_MS = 60_000;
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

export class Session {
  readonly store = new Store();
  readonly backend: Backend;
  openServerId = $state<Id | null>(null);
  openChannelId = $state<Id | null>(null);
  private gateway: Gateway | null = null;
  private lastMemberFetch = new Map<Id, number>();
  private poll: ReturnType<typeof setInterval> | null = null;
  private readonly onFocus = () => void this.refreshMembers(false);
  private onSignedOut: () => void = () => {};

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
    const settings = await this.backend.settings(['notifications', 'ordering']).catch(() => ({}));
    this.store.settings = parseSettings(settings);
    this.lastMemberFetch.clear();
    if (this.openServerId) {
      this.gateway?.subscribe(this.openServerId);
      await this.loadMembers(this.openServerId, true);
    }
    // Windows held across a disconnect may miss edits and deletes. Reload the open one where it was,
    // and drop the rest so they reload when opened.
    for (const channel of [...this.store.windows.keys()]) if (channel !== this.openChannelId) this.store.windows.delete(channel);
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

  jumpToPresent(channel: Id): Promise<void> {
    return this.loadLatest(channel);
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
