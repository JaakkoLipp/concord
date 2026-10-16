/** Cold inbox fetches obey one channel's shared rate limit and stay outside history windows. */
import { describe, expect, it, vi } from 'vitest';
import type { Backend } from './backend.ts';
import type { Message, User } from './entities.ts';
import { Session } from './session.svelte.ts';

const message = (channel: string, id: string): Message => ({
  id, channel, author: 'author', content: 'mention', attachments: [], embeds: [],
  mentions: [], roleMentions: [], replies: [], reactions: {}, pinned: false,
});

describe('inbox bodies', () => {
  it('serializes one channel, reuses its author and does not grow history storage', async () => {
    let active = false;
    const fetch = vi.fn(async (channel: string, id: string) => {
      expect(active).toBe(false);
      active = true;
      await new Promise((resolve) => setTimeout(resolve, 0));
      active = false;
      return message(channel, id);
    });
    const user = vi.fn(async () => ({ id: 'author', username: 'Author' } as User));
    const s = new Session({ message: fetch, user } as unknown as Backend);
    s.store.unreads.set('C', { channel: 'C', mentions: ['1', '2', '3'] });
    const result = await Promise.all(['1', '2', '3'].map((id) => s.loadMention('C', id)));
    expect(result.map((m) => m.id)).toEqual(['1', '2', '3']);
    expect(user).toHaveBeenCalledTimes(1);
    expect(s.store.messages.size).toBe(0);
  });

  it('skips a queued body once the channel has been read', async () => {
    let finish!: (m: Message) => void;
    const fetch = vi.fn(() => new Promise<Message>((resolve) => { finish = resolve; }));
    const s = new Session({ message: fetch, user: async () => ({ id: 'author' }) } as unknown as Backend);
    s.store.unreads.set('C', { channel: 'C', mentions: ['1', '2'] });
    const first = s.loadMention('C', '1');
    const second = s.loadMention('C', '2');
    const skipped = expect(second).rejects.toThrow('mention no longer unread');
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    s.store.unreads.set('C', { channel: 'C', lastId: '2', mentions: [] });
    finish(message('C', '1'));
    await first;
    await skipped;
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
