/**
 * The realtime connection (architecture section 4.3): Authenticate as the first frame, an explicit Ready
 * field list, Ping every 20 seconds, reconnect when no Pong arrives within 10, exponential backoff with
 * jitter, and immediate retry when the browser comes back online. Every reconnect is a cold start.
 *
 * On 0.15.5 the socket also keeps every server the user is in subscribed (m2b-plan.md decision 1). Besides
 * live status from members who aren't friends, that works around a Stoat bug: after a UserRelationship
 * event, a socket stops getting its own user's updates and never gets the new friend's. Subscribing again
 * repairs it, so a relationship event re-sends every subscription.
 */
import type { Capabilities, Gateway, GatewayHandlers } from '@concord/domain';
import { mapFrames } from './events.ts';
import { readyQuery, type Frame, type Socket, type Transport } from './transport.ts';

const PING_MS = 20_000;
const PONG_TIMEOUT_MS = 10_000;
/** Stoat drops a subscription 15 minutes after the last Subscribe for it. */
const SUBSCRIBE_EVERY_MS = 10 * 60_000;
/** A Subscribe isn't repeated sooner than this, unless something requires it. */
const SUBSCRIBE_DEDUPE_MS = 60_000;
/** Stoat keeps this many subscribed servers per socket, dropping the least recently subscribed. */
export const SUBSCRIBE_MAX = 5;
const MAX_BACKOFF_MS = 30_000;

export class StoatGateway implements Gateway {
  private socket: Socket | null = null;
  private closed = false;
  private attempt = 0;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private pongDue: ReturnType<typeof setTimeout> | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  /** The user's servers, least important first: the open server last, so it is subscribed most recently. */
  private servers: string[] = [];
  private readonly sentAt = new Map<string, number>();
  private selfId: string | null = null;
  private resubscribe: ReturnType<typeof setTimeout> | null = null;
  private readonly transport: Transport;
  private readonly token: string;
  private readonly handlers: GatewayHandlers;
  private readonly caps: Capabilities;
  private readonly onOnline = () => {
    if (!this.socket && !this.closed) this.reconnectNow();
  };
  /** A sleeping laptop or a frozen tab can let subscriptions lapse without the interval firing. */
  private readonly onWake = () => {
    if (globalThis.document?.visibilityState !== 'hidden') this.sendSubscriptions(false);
  };

  constructor(transport: Transport, token: string, handlers: GatewayHandlers, caps: Capabilities) {
    this.transport = transport;
    this.token = token;
    this.handlers = handlers;
    this.caps = caps;
    globalThis.addEventListener?.('online', this.onOnline);
    globalThis.addEventListener?.('focus', this.onWake);
    globalThis.document?.addEventListener('visibilitychange', this.onWake);
    void this.open();
  }

  subscribe(server: string): void {
    this.servers = [...this.servers.filter((s) => s !== server), server];
    this.sendSubscriptions(false);
  }

  /** Subscribe the most important servers, the most important last. `force` ignores the dedupe. */
  private sendSubscriptions(force: boolean): void {
    if (!this.caps.serverSubscribe || !this.socket) return;
    for (const server of this.servers.slice(-SUBSCRIBE_MAX)) {
      if (!force && Date.now() - (this.sentAt.get(server) ?? 0) < SUBSCRIBE_DEDUPE_MS) continue;
      this.sentAt.set(server, Date.now());
      this.send({ type: 'Subscribe', server_id: server });
    }
  }

  /** Follow the user's servers from the frames that change them. */
  private trackServers(frame: Frame): void {
    // Frames are untyped JSON; these read the fields the recorded fixtures show.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const x = frame as any;
    switch (frame.type) {
      case 'Ready': {
        this.selfId = ((x.users ?? []) as { _id: string; relationship?: string }[]).find((u) => u.relationship === 'User')?._id ?? this.selfId;
        const ids = ((x.servers ?? []) as { _id: string }[]).map((s) => s._id);
        this.servers = [...ids.filter((id) => !this.servers.includes(id)), ...this.servers.filter((id) => ids.includes(id))];
        this.sentAt.clear();
        this.sendSubscriptions(true);
        return;
      }
      case 'ServerCreate':
        this.servers = [...this.servers.filter((s) => s !== x.server?._id), x.server?._id].filter(Boolean);
        this.sendSubscriptions(false);
        return;
      case 'ServerDelete':
        this.servers = this.servers.filter((s) => s !== x.id);
        return;
      case 'ServerMemberLeave':
        if (x.user === this.selfId) this.servers = this.servers.filter((s) => s !== x.id);
        return;
      case 'UserRelationship':
        // A burst of relationship events needs one repair, after the last of them.
        if (this.resubscribe) clearTimeout(this.resubscribe);
        this.resubscribe = setTimeout(() => {
          this.resubscribe = null;
          this.sendSubscriptions(true);
        }, 200);
        return;
    }
  }

  typing(channel: string, typing: boolean): void {
    this.send({ type: typing ? 'BeginTyping' : 'EndTyping', channel });
  }

  close(): void {
    this.closed = true;
    globalThis.removeEventListener?.('online', this.onOnline);
    globalThis.removeEventListener?.('focus', this.onWake);
    globalThis.document?.removeEventListener('visibilitychange', this.onWake);
    if (this.resubscribe) clearTimeout(this.resubscribe);
    this.clearTimers();
    if (this.retry) clearTimeout(this.retry);
    this.socket?.close();
    this.socket = null;
    this.handlers.onState('offline');
  }

  private send(frame: Frame): void {
    try {
      this.socket?.send(frame);
    } catch {
      // A socket that is closing; the reconnect will catch up.
    }
  }

  private async open(): Promise<void> {
    this.handlers.onState(this.attempt === 0 ? 'connecting' : 'reconnecting');
    let socket: Socket;
    try {
      socket = await this.transport.connect(readyQuery());
    } catch {
      this.scheduleReconnect();
      return;
    }
    if (this.closed) {
      socket.close();
      return;
    }
    this.socket = socket;
    socket.onFrame((frame) => this.onFrame(frame));
    socket.onClose(() => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.clearTimers();
      if (!this.closed) this.scheduleReconnect();
    });
    socket.send({ type: 'Authenticate', token: this.token });
  }

  private onFrame(frame: Frame): void {
    switch (frame.type) {
      case 'Error':
        if (frame.error === 'InvalidSession') {
          this.closed = true;
          this.socket?.close();
          this.handlers.onState('invalid-session');
        }
        return;
      case 'Pong':
        if (this.pongDue) clearTimeout(this.pongDue);
        this.pongDue = null;
        return;
      case 'Ready':
        this.attempt = 0;
        this.startPing();
        // Subscriptions belong to the socket, so a new socket needs them again: trackServers sends them.
        this.timers.push(setInterval(() => this.sendSubscriptions(true), SUBSCRIBE_EVERY_MS));
        break;
    }
    this.trackServers(frame);
    for (const event of mapFrames(frame)) this.handlers.onEvent(event);
    if (frame.type === 'Ready') this.handlers.onState('ready');
  }

  private startPing(): void {
    this.timers.push(setInterval(() => {
      this.send({ type: 'Ping', data: Date.now() });
      if (!this.pongDue) {
        this.pongDue = setTimeout(() => {
          // No Pong: treat the socket as dead.
          const s = this.socket;
          this.socket = null;
          this.clearTimers();
          s?.close();
          if (!this.closed) this.scheduleReconnect();
        }, PONG_TIMEOUT_MS);
      }
    }, PING_MS));
  }

  private clearTimers(): void {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    if (this.pongDue) clearTimeout(this.pongDue);
    this.pongDue = null;
  }

  private scheduleReconnect(): void {
    if (this.retry || this.closed) return;
    this.handlers.onState('reconnecting');
    const base = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.attempt);
    const delay = base / 2 + Math.random() * (base / 2);
    this.attempt++;
    this.retry = setTimeout(() => {
      this.retry = null;
      void this.open();
    }, delay);
  }

  private reconnectNow(): void {
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    this.attempt = 0;
    void this.open();
  }
}
