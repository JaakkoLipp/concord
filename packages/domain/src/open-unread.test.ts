/** Opening an unread channel must retain its read point and load forward without skipping history. */
import { describe, expect, it, vi } from 'vitest';
import type { Backend, GatewayHandlers, MessageQuery } from './backend.ts';
import type { Channel, Message } from './entities.ts';
import { Session } from './session.svelte.ts';

const channel = 'C';
const id = (n: number) => String(n).padStart(26, '0');
const message = (n: number): Message => ({
  id: id(n), channel, author: 'other', content: String(n), attachments: [], embeds: [],
  mentions: [], roleMentions: [], replies: [], reactions: {}, pinned: false,
});
function setup(count = 151, read = 1) {
  const all = Array.from({ length: count }, (_, n) => message(n + 1));
  const messages = vi.fn(async (_channel: string, q: MessageQuery) => ({
    messages: q.nearby ? all.slice(0, 100) : q.sort === 'Oldest'
      ? all.filter((m) => !q.after || m.id > q.after).slice(0, 100) : all.slice(-100),
    users: [], members: [],
  }));
  const session = new Session({ messages } as unknown as Backend);
  session.store.channels.set(channel, { id: channel, kind: 'text', lastMessageId: id(count) } as Channel);
  session.store.setUnreads([{ channel, lastId: id(read), mentions: [] }]);
  return { session, messages };
}
describe('opening at unread', () => {
  it('loads the first 100 after the marker rather than the last 100, without acknowledging', async () => {
    const { session, messages } = setup();
    await session.openChannel(channel);
    expect(messages).toHaveBeenLastCalledWith(channel, { limit: 100, after: id(1), sort: 'Oldest' });
    expect(session.store.windows.get(channel)).toEqual({ ids: Array.from({ length: 100 }, (_, n) => id(n + 2)), atNewest: false, atOldest: false });
    expect(session.store.unreads.get(channel)?.lastId).toBe(id(1));
    await session.loadNewer(channel);
    expect(session.store.windows.get(channel)?.ids).toHaveLength(150);
    expect(session.store.windows.get(channel)?.atNewest).toBe(true);
    expect(session.store.isUnread(channel)).toBe(true);
  });
  it('uses fetched history when channel metadata still reports the read marker as newest', async () => {
    const { session, messages } = setup();
    const c = session.store.channels.get(channel)!;
    session.store.channels.set(channel, { ...c, lastMessageId: id(1) } as Channel);
    await session.openChannel(channel);
    expect(messages).toHaveBeenLastCalledWith(channel, { limit: 100, after: id(1), sort: 'Oldest' });
    expect(session.store.isUnread(channel)).toBe(true);
    expect(session.store.windows.get(channel)?.ids[0]).toBe(id(2));
  });
  it('reuses a window containing the boundary', async () => {
    const { session, messages } = setup(20);
    await session.openChannel(channel);
    await session.openChannel(channel);
    expect(messages).toHaveBeenCalledTimes(1);
  });
  it('loads from the beginning when no read marker exists', async () => {
    const { session, messages } = setup();
    session.store.markUnread(channel, undefined);
    await session.openChannel(channel);
    expect(messages).toHaveBeenLastCalledWith(channel, { limit: 100, sort: 'Oldest' });
    expect(session.store.windows.get(channel)?.atOldest).toBe(true);
  });
  it('preserves a held Mark unread window', async () => {
    const { session, messages } = setup();
    session.store.setWindow(channel, [message(140)], { atNewest: true, atOldest: false });
    session.heldUnread.add(channel);
    await session.openChannel(channel);
    expect(messages).not.toHaveBeenCalled();
    expect(session.store.windows.get(channel)?.ids).toEqual([id(140)]);
  });
  it('does not let a pending unread load replace an explicit jump', async () => {
    const { session, messages } = setup();
    let finish!: (page: { messages: Message[]; users: []; members: [] }) => void;
    messages.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const opening = session.openChannel(channel);
    await session.jumpTo(channel, id(30));
    const jumped = session.store.windows.get(channel);
    finish({ messages: [message(151)], users: [], members: [] });
    await opening;
    expect(session.store.windows.get(channel)).toBe(jumped);
  });
  it('does not let the initial cold-start refresh overwrite a fresh unread opening', async () => {
    const { session, messages } = setup();
    let handlers!: GatewayHandlers;
    let settings!: (value: Record<string, { value: string }>) => void;
    Object.assign(session.backend, {
      setToken: () => {},
      root: async () => ({}),
      self: async () => ({ id: 'self' }),
      connect: (h: GatewayHandlers) => { handlers = h; return { close: () => {} }; },
      settings: () => new Promise((resolve) => { settings = resolve; }),
      capabilities: { serverSubscribe: true },
    });
    await session.start('test', () => {});
    try {
      handlers.onState('ready');
      await session.openChannel(channel);
      const opened = session.store.windows.get(channel);
      settings({});
      await vi.waitFor(() => expect(messages).toHaveBeenCalledTimes(2));
      // Let the settings continuation and member/history continuation finish.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(session.store.windows.get(channel)).toBe(opened);
      expect(messages).toHaveBeenCalledTimes(2);
    } finally {
      await session.stop();
    }
  });

});
