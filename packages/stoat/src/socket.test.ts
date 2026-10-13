/** The gateway's Subscribe policy (m2b-plan.md decision 1), on fake timers with a fake socket. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StoatGateway, SUBSCRIBE_MAX } from './socket.ts';
import type { Frame, Socket, Transport } from './transport.ts';

class FakeSocket implements Socket {
  sent: Frame[] = [];
  private listener: (f: Frame) => void = () => {};
  send(frame: Frame) {
    this.sent.push(frame);
    if (frame.type === 'Ping') setTimeout(() => this.listener({ type: 'Pong', data: frame.data }), 1);
  }
  close() {}
  onFrame(l: (f: Frame) => void) { this.listener = l; return () => {}; }
  onClose() { return () => {}; }
  receive(f: Frame) { this.listener(f); }
  subscribes() { return this.sent.filter((f) => f.type === 'Subscribe').map((f) => f.server_id); }
}

async function setup(servers: string[], serverSubscribe = true) {
  const socket = new FakeSocket();
  const transport: Transport = { request: async () => ({ status: 200, headers: {}, body: null }), connect: async () => socket };
  const gw = new StoatGateway(transport, 'token', { onEvent: () => {}, onState: () => {} }, { serverSubscribe });
  await vi.waitFor(() => expect(socket.sent[0]?.type).toBe('Authenticate'));
  socket.receive({ type: 'Ready', users: [{ _id: 'ME', relationship: 'User' }], servers: servers.map((_id) => ({ _id })) });
  return { gw, socket };
}

describe('Subscribe', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] }));
  afterEach(() => vi.useRealTimers());

  it('subscribes every server on Ready, and the open one last', async () => {
    const { gw, socket } = await setup(['A', 'B', 'C']);
    expect(socket.subscribes()).toEqual(['A', 'B', 'C']);
    socket.sent = [];
    gw.subscribe('A');
    // Sent a moment ago: deduplicated.
    expect(socket.subscribes()).toEqual([]);
    vi.advanceTimersByTime(61_000);
    gw.subscribe('B');
    expect(socket.subscribes().at(-1)).toBe('B');
    gw.close();
  });

  it(`keeps at most ${SUBSCRIBE_MAX}, preferring the open server`, async () => {
    const { gw, socket } = await setup(['A', 'B', 'C', 'D', 'E', 'F']);
    expect(socket.subscribes()).toEqual(['B', 'C', 'D', 'E', 'F']);
    socket.sent = [];
    vi.advanceTimersByTime(61_000);
    gw.subscribe('A');
    expect(socket.subscribes()).toEqual(['C', 'D', 'E', 'F', 'A']);
    gw.close();
  });

  it('re-sends everything after relationship events, once per burst', async () => {
    const { gw, socket } = await setup(['A', 'B']);
    socket.sent = [];
    socket.receive({ type: 'UserRelationship', id: 'ME', user: { _id: 'X', relationship: 'Incoming' } });
    socket.receive({ type: 'UserRelationship', id: 'ME', user: { _id: 'X', relationship: 'Friend' } });
    expect(socket.subscribes()).toEqual([]);
    vi.advanceTimersByTime(250);
    expect(socket.subscribes()).toEqual(['A', 'B']);
    gw.close();
  });

  it('renews every 10 minutes and follows joins and leaves', async () => {
    const { gw, socket } = await setup(['A']);
    socket.receive({ type: 'ServerCreate', server: { _id: 'B' } });
    socket.receive({ type: 'ServerMemberLeave', id: 'A', user: 'ME' });
    socket.sent = [];
    vi.advanceTimersByTime(10 * 60_000);
    expect(socket.subscribes()).toEqual(['B']);
    gw.close();
  });

  it('sends nothing where the backend lacks Subscribe', async () => {
    const { gw, socket } = await setup(['A'], false);
    gw.subscribe('A');
    expect(socket.subscribes()).toEqual([]);
    gw.close();
  });
});
