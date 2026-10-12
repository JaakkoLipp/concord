/**
 * The realtime connection (architecture section 4.3): Authenticate as the first frame, an explicit Ready
 * field list, Ping every 20 seconds, reconnect when no Pong arrives within 10, exponential backoff with
 * jitter, and immediate retry when the browser comes back online. Every reconnect is a cold start.
 */
import type { Capabilities, Gateway, GatewayHandlers } from '@concord/domain';
import { mapFrames } from './events.ts';
import { readyQuery, type Frame, type Socket, type Transport } from './transport.ts';

const PING_MS = 20_000;
const PONG_TIMEOUT_MS = 10_000;
const SUBSCRIBE_EVERY_MS = 10 * 60_000;
const MAX_BACKOFF_MS = 30_000;

export class StoatGateway implements Gateway {
  private socket: Socket | null = null;
  private closed = false;
  private attempt = 0;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private pongDue: ReturnType<typeof setTimeout> | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private readonly subscribed = new Map<string, number>();
  private readonly transport: Transport;
  private readonly token: string;
  private readonly handlers: GatewayHandlers;
  private readonly caps: Capabilities;
  private readonly onOnline = () => {
    if (!this.socket && !this.closed) this.reconnectNow();
  };

  constructor(transport: Transport, token: string, handlers: GatewayHandlers, caps: Capabilities) {
    this.transport = transport;
    this.token = token;
    this.handlers = handlers;
    this.caps = caps;
    globalThis.addEventListener?.('online', this.onOnline);
    void this.open();
  }

  subscribe(server: string): void {
    if (!this.caps.serverSubscribe) return;
    const last = this.subscribed.get(server) ?? 0;
    this.subscribed.set(server, Date.now());
    if (Date.now() - last > 60_000) this.send({ type: 'Subscribe', server_id: server });
  }

  close(): void {
    this.closed = true;
    globalThis.removeEventListener?.('online', this.onOnline);
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
        // Subscriptions belong to the socket, so a new socket needs them again.
        for (const server of this.subscribed.keys()) this.send({ type: 'Subscribe', server_id: server });
        this.timers.push(setInterval(() => {
          for (const server of this.subscribed.keys()) this.send({ type: 'Subscribe', server_id: server });
        }, SUBSCRIBE_EVERY_MS));
        break;
    }
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
