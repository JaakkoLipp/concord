/**
 * Optimistic sending, reconciliation and acks (m2a-plan.md task 2), against a fake backend.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Backend, OutgoingMessage } from './backend.ts';
import type { Channel, Message, User } from './entities.ts';
import { BackendError } from './errors.ts';
import { Session } from './session.svelte.ts';

const SELF: User = { id: '01SELF000000000000000000AA', username: 'dev', discriminator: '0001', relationship: 'User', online: true } as User;
const CH = '01CHANNEL00000000000000000A';
const OLD = '01M00000000000000000000001';

function message(id: string, extra: Partial<Message> = {}): Message {
  return { id, channel: CH, author: SELF.id, content: 'hei', attachments: [], embeds: [], mentions: [], roleMentions: [], replies: [], reactions: {}, pinned: false, ...extra };
}

type Send = (channel: string, m: OutgoingMessage, key: string) => Promise<Message>;

function setup(send: Send) {
  const calls = { keys: [] as string[], acks: [] as string[], fetches: 0 };
  let serverId = 1000;
  const sent: Message[] = [];
  const backend = {
    capabilities: { serverSubscribe: true },
    sendMessage: async (c: string, m: OutgoingMessage, key: string) => {
      calls.keys.push(key);
      const r = await send(c, m, key);
      sent.push(r);
      return r;
    },
    ack: async (_c: string, id: string) => void calls.acks.push(id),
    messages: async () => {
      calls.fetches++;
      return { messages: [message(OLD), ...sent], users: [], members: [] };
    },
  } as unknown as Backend;
  const session = new Session(backend);
  const store = session.store;
  store.self = SELF;
  store.channels.set(CH, { id: CH, kind: 'text', server: '01SERVER', name: 'yleinen', lastMessageId: OLD } as Channel);
  store.setWindow(CH, [message(OLD)], { atNewest: true, atOldest: true });
  const nextId = () => `01M0000000000000000000${String(serverId++).padStart(4, '0')}`;
  return { session, store, calls, nextId };
}

const windowIds = (s: Session) => s.store.windows.get(CH)!.ids;

describe('optimistic send', () => {
  it('reconciles when the send response arrives before the socket echo', async () => {
    let id = '';
    const { session, store, nextId } = setup(async (_c, m, key) => (id = nextId(), message(id, { content: m.content, nonce: key })));
    await session.send(CH, 'moi');
    expect(store.pending.size).toBe(0);
    store.apply({ type: 'messageCreate', message: message(id, { content: 'moi', nonce: [...store.ownNonces][0]! }) });
    expect(windowIds(session)).toEqual([OLD, id]);
  });

  it('reconciles when the socket echo arrives first', async () => {
    let echo: () => void = () => {};
    const { session, store, nextId } = setup((_c, m, key) => new Promise((resolve) => {
      const real = message(nextId(), { content: m.content, nonce: key });
      echo = () => { store.apply({ type: 'messageCreate', message: real }); resolve(real); };
    }));
    const sending = session.send(CH, 'moi');
    await vi.waitFor(() => expect(store.pending.size).toBe(1));
    expect(store.pendingIn(CH)[0]!.state).toBe('sending');
    echo();
    await sending;
    expect(store.pending.size).toBe(0);
    expect(windowIds(session)).toHaveLength(2);
  });

  it('marks a network failure retry-safe, and a 409 on retry as sent', async () => {
    let attempt = 0;
    const { session, store, calls, nextId } = setup(async (_c, m, key) => {
      attempt++;
      if (attempt === 1) {
        // Stoat stored it, but the response was lost.
        const real = message(nextId(), { content: m.content, nonce: key });
        stored.push(real);
        throw new TypeError('Failed to fetch');
      }
      throw new BackendError(409, 'HTTP409', 'conflict');
    });
    const stored: Message[] = [];
    (session.backend as unknown as { messages: () => Promise<unknown> }).messages = async () => {
      calls.fetches++;
      return { messages: [...stored, message(OLD)], users: [], members: [] };
    };
    await session.send(CH, 'moi');
    const [p] = store.pendingIn(CH);
    expect(p).toMatchObject({ state: 'failed', error: 'network' });
    await session.retry(p!.key);
    expect(calls.keys[0]).toBe(calls.keys[1]);
    expect(calls.fetches).toBe(1);
    expect(store.pending.size).toBe(0);
    expect(windowIds(session)).toEqual([OLD, stored[0]!.id]);
  });

  it('keeps the backend reason for other failures', async () => {
    const { session, store } = setup(async () => {
      throw new BackendError(422, 'PayloadTooLarge', 'too large');
    });
    await session.send(CH, 'x');
    expect(store.pendingIn(CH)[0]).toMatchObject({ state: 'failed', error: 'PayloadTooLarge' });
  });

  it('settles a pending message found in a history fetch', async () => {
    const { session, store, nextId } = setup(async () => {
      throw new TypeError('offline');
    });
    await session.send(CH, 'moi');
    const key = store.pendingIn(CH)[0]!.key;
    store.setWindow(CH, [message(OLD), message(nextId(), { nonce: key })], { atNewest: true, atOldest: true });
    expect(store.pending.size).toBe(0);
  });
});

describe('acks', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('never lets older unread state bring back a marker', () => {
    const { store } = setup(async () => message(OLD));
    const newest = '01M00000000000000000000009';
    store.channels.set(CH, { ...store.channels.get(CH)!, lastMessageId: newest } as Channel);
    store.setUnreads([{ channel: CH, lastId: OLD, mentions: [newest] }]);
    expect(store.isUnread(CH)).toBe(true);
    store.markRead(CH, newest);
    expect(store.isUnread(CH)).toBe(false);
    // Stoat hasn't applied the ack yet: a reconnect fetches the old state.
    store.setUnreads([{ channel: CH, lastId: OLD, mentions: [newest] }]);
    expect(store.isUnread(CH)).toBe(false);
    expect(store.mentionCount(CH)).toBe(0);
    // Another session acks an older message.
    store.apply({ type: 'ack', channel: CH, user: SELF.id, message: OLD });
    expect(store.isUnread(CH)).toBe(false);
  });

  it('sends one ack at once, then one trailing ack for the newest message', async () => {
    const { session, store, calls } = setup(async () => message(OLD));
    const bump = (id: string) => store.channels.set(CH, { ...store.channels.get(CH)!, lastMessageId: id } as Channel);
    bump('01M00000000000000000000002');
    session.markRead(CH);
    bump('01M00000000000000000000003');
    session.markRead(CH);
    bump('01M00000000000000000000004');
    session.markRead(CH);
    expect(calls.acks).toEqual(['01M00000000000000000000002']);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(calls.acks).toEqual(['01M00000000000000000000002', '01M00000000000000000000004']);
    session.markRead(CH);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(calls.acks).toHaveLength(2);
  });
});

describe('optimistic edit and delete', () => {
  it('reverts a failed edit and keeps the window place of a failed delete', async () => {
    const { session, store } = setup(async () => message(OLD));
    const fail = async () => {
      throw new BackendError(403, 'MissingPermission', 'no');
    };
    Object.assign(session.backend, { editMessage: fail, deleteMessage: fail });
    const NEWER = '01M00000000000000000000005';
    store.setWindow(CH, [message(OLD), message(NEWER, { content: 'toka' })], { atNewest: true, atOldest: true });

    const editing = session.editMessage(CH, OLD, 'muokattu');
    expect(store.messages.get(OLD)!.content).toBe('muokattu');
    expect(store.messages.get(OLD)!.edited).toBeDefined();
    await expect(editing).rejects.toThrow();
    expect(store.messages.get(OLD)!.content).toBe('hei');
    expect(store.messages.get(OLD)!.edited).toBeUndefined();

    const deleting = session.deleteMessage(CH, OLD);
    expect(windowIds(session)).toEqual([NEWER]);
    await expect(deleting).rejects.toThrow();
    expect(windowIds(session)).toEqual([OLD, NEWER]);
    expect(store.deleted.has(OLD)).toBe(false);
  });

  it('keeps a newer edit from elsewhere when its own edit fails', async () => {
    const { session, store } = setup(async () => message(OLD));
    let reject: (e: unknown) => void = () => {};
    Object.assign(session.backend, { editMessage: () => new Promise((_, r) => (reject = r)) });
    const editing = session.editMessage(CH, OLD, 'minun');
    store.apply({ type: 'messageUpdate', id: OLD, channel: CH, data: { content: 'toisen' }, clear: [] });
    reject(new BackendError(500, 'InternalError', 'x'));
    await expect(editing).rejects.toThrow();
    expect(store.messages.get(OLD)!.content).toBe('toisen');
  });
});

describe('reactions', () => {
  it('reacts optimistically and reverts on failure', async () => {
    const { session, store } = setup(async () => message(OLD));
    let fail = false;
    Object.assign(session.backend, { react: async () => { if (fail) throw new BackendError(403, 'MissingPermission', 'no'); } });
    await session.react(CH, OLD, '👍');
    expect(store.messages.get(OLD)!.reactions['👍']).toEqual([SELF.id]);
    fail = true;
    const removing = session.react(CH, OLD, '👍');
    expect(store.messages.get(OLD)!.reactions['👍']).toBeUndefined();
    await expect(removing).rejects.toThrow();
    expect(store.messages.get(OLD)!.reactions['👍']).toEqual([SELF.id]);
  });
});

describe('attachments', () => {
  it('uploads before sending, and a retry uploads only what failed', async () => {
    const sentWith: string[][] = [];
    const { session, store, nextId } = setup(async (_c, m, key) => {
      sentWith.push(m.attachments);
      return message(nextId(), { nonce: key });
    });
    const uploads: string[] = [];
    let failB = true;
    Object.assign(session.backend, {
      upload: async (_f: Blob, name: string, progress?: (f: number) => void) => {
        uploads.push(name);
        progress?.(0.5);
        if (name === 'b.png' && failB) throw new TypeError('offline');
        return `file-${name}`;
      },
    });
    const file = (name: string) => ({ file: new Blob(['x']), name });
    await session.send(CH, '', [], [file('a.png'), file('b.png')]);
    const [p] = store.pendingIn(CH);
    expect(p).toMatchObject({ state: 'failed', error: 'network' });
    expect(p!.files.map((f) => f.id)).toEqual(['file-a.png', undefined]);
    failB = false;
    await session.retry(p!.key);
    expect(uploads).toEqual(['a.png', 'b.png', 'b.png']);
    expect(sentWith).toEqual([['file-a.png', 'file-b.png']]);
    expect(store.pending.size).toBe(0);
  });
});

describe('typing', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("follows Stoat's timing: start at most every 2.5 s, stop after 1 s of quiet or on send", async () => {
    const { session } = setup(async () => message(OLD));
    const frames: string[] = [];
    (session as unknown as { gateway: unknown }).gateway = { typing: (_c: string, on: boolean) => frames.push(on ? 'begin' : 'end') };
    for (let i = 0; i < 10; i++) {
      session.typing(CH);
      await vi.advanceTimersByTimeAsync(300);
    }
    expect(frames).toEqual(['begin', 'begin']);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(frames).toEqual(['begin', 'begin', 'end']);
    session.typing(CH);
    session.stopTyping(CH);
    expect(frames).toEqual(['begin', 'begin', 'end', 'begin', 'end']);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(frames).toHaveLength(5);
  });
});

describe('review fixes', () => {
  afterEach(() => vi.useRealTimers());
  const bump = (store: Session['store'], id: string) => store.channels.set(CH, { ...store.channels.get(CH)!, lastMessageId: id } as Channel);

  it('a send reads only up to its own message', async () => {
    let finish: () => void = () => {};
    const id = '01M00000000000000000001000';
    const { session, store } = setup((_c, _m, key) => new Promise((resolve) => (finish = () => resolve(message(id, { nonce: key })))));
    const sending = session.send(CH, 'moi');
    await vi.waitFor(() => expect(store.pending.size).toBe(1));
    // While a slow send is in flight, the user moves away and someone else posts here.
    const other = '01M0000000000000000000ZZZZ';
    store.apply({ type: 'messageCreate', message: message(other, { author: '01OTHER000000000000000000A' }) });
    finish();
    await sending;
    expect(store.unreads.get(CH)?.lastId).toBe(id);
    expect(store.isUnread(CH)).toBe(true);
  });

  it('a trailing ack sends the read point even if a newer message arrived meanwhile', async () => {
    vi.useFakeTimers();
    const { session, store, calls } = setup(async () => message(OLD));
    bump(store, '01M00000000000000000000002');
    session.markRead(CH);
    bump(store, '01M00000000000000000000003');
    session.markRead(CH);
    bump(store, '01M00000000000000000000004');
    await vi.advanceTimersByTimeAsync(2_000);
    expect(calls.acks).toEqual(['01M00000000000000000000002', '01M00000000000000000000003']);
  });

  it('retries a failed ack', async () => {
    vi.useFakeTimers();
    const { session, store, calls } = setup(async () => message(OLD));
    let fail = true;
    Object.assign(session.backend, { ack: async (_c: string, id: string) => { if (fail) throw new TypeError('offline'); calls.acks.push(id); } });
    bump(store, '01M00000000000000000000002');
    session.markRead(CH);
    await vi.advanceTimersByTimeAsync(0);
    fail = false;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(calls.acks).toEqual(['01M00000000000000000000002']);
  });

  it('keeps a message that arrived while the newest page was loading', async () => {
    const { session, store } = setup(async () => message(OLD));
    const live = '01M0000000000000000000LIVE';
    let release: () => void = () => {};
    Object.assign(session.backend, {
      messages: () => new Promise((resolve) => (release = () => resolve({ messages: [message(OLD)], users: [], members: [] }))),
    });
    const loading = session.loadLatest(CH);
    store.apply({ type: 'messageCreate', message: message(live) });
    release();
    await loading;
    expect(windowIds(session)).toEqual([OLD, live]);
  });

  it('keeps a 409 message as failed when the follow-up fetch fails', async () => {
    const { session, store } = setup(async () => {
      throw new BackendError(409, 'HTTP409', 'conflict');
    });
    Object.assign(session.backend, { messages: async () => { throw new TypeError('offline'); } });
    await session.send(CH, 'moi');
    expect(store.pendingIn(CH)[0]).toMatchObject({ state: 'failed', error: 'network' });
  });
});
