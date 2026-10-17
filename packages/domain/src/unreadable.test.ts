/** A channel whose history Stoat refuses, without Read message history (m4.7-plan.md task 5). */
import { describe, expect, it, vi } from 'vitest';
import type { Backend, GatewayHandlers } from './backend.ts';
import type { Channel, Message } from './entities.ts';
import { BackendError } from './errors.ts';
import { Session } from './session.svelte.ts';

const channel = 'C';
const id = (n: number) => String(n).padStart(26, '0');
const message = (n: number): Message => ({
  id: id(n), channel, author: 'other', content: String(n), attachments: [], embeds: [],
  mentions: [], roleMentions: [], replies: [], reactions: {}, pinned: false,
});
const refusal = () => new BackendError(403, 'MissingPermission', 'GET /channels/C/messages: 403 MissingPermission');

function setup() {
  let readable = false;
  const messages = vi.fn(async () => {
    if (!readable) throw refusal();
    return { messages: [message(1), message(2)], users: [], members: [] };
  });
  const session = new Session({ messages } as unknown as Backend);
  session.store.channels.set(channel, { id: channel, kind: 'text', lastMessageId: id(2) } as Channel);
  return { session, messages, grant: () => { readable = true; } };
}

describe('an unreadable channel', () => {
  it('opens empty at the present, and loads its history once it is granted', async () => {
    const { session, messages, grant } = setup();
    await session.openChannel(channel);
    expect(session.store.windows.get(channel)).toEqual({ ids: [], atNewest: true, atOldest: true });
    expect(session.unreadable.has(channel)).toBe(true);
    grant();
    await session.openChannel(channel);
    expect(messages).toHaveBeenCalledTimes(2);
    expect(session.store.windows.get(channel)?.ids).toEqual([id(1), id(2)]);
    expect(session.unreadable.has(channel)).toBe(false);
  });

  it('is reloaded on a reconnect without an unhandled refusal', async () => {
    const { session, messages } = setup();
    let handlers!: GatewayHandlers;
    Object.assign(session.backend, {
      setToken: () => {},
      root: async () => ({}),
      self: async () => ({ id: 'self' }),
      connect: (h: GatewayHandlers) => { handlers = h; return { close: () => {} }; },
      settings: async () => ({}),
      capabilities: { serverSubscribe: true },
    });
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    await session.start('test', () => {});
    try {
      handlers.onState('ready');
      await session.openChannel(channel);
      // The window held across Ready is the unreadable one: a reconnect reloads it.
      handlers.onState('reconnecting');
      handlers.onState('ready');
      await vi.waitFor(() => expect(messages).toHaveBeenCalledTimes(2));
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(unhandled).not.toHaveBeenCalled();
      expect(session.store.windows.get(channel)).toEqual({ ids: [], atNewest: true, atOldest: true });
    } finally {
      process.off('unhandledRejection', unhandled);
      await session.stop();
    }
  });
});
