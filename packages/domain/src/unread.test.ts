/** "Mark unread" (m4.5-plan.md task 2): the read point moves back, and reading again moves it forward. */
import { describe, expect, it } from 'vitest';
import type { Channel } from './entities.ts';
import { Store } from './store/store.svelte.ts';

const CH = '01HZZZZZZZZZZZZZZZZZZZCHAN';
const [A, B, C] = ['01HZZZZZZZZZZZZZZZZZZZ000A', '01HZZZZZZZZZZZZZZZZZZZ000B', '01HZZZZZZZZZZZZZZZZZZZ000C'];

function store(): Store {
  const s = new Store();
  s.channels.set(CH, { id: CH, kind: 'text', server: 'S', name: 'x', lastMessageId: C, rolePermissions: {} } as unknown as Channel);
  s.setUnreads([{ channel: CH, lastId: C, mentions: [] }]);
  return s;
}

describe('mark unread', () => {
  it('moves the read point back past the local floor', () => {
    const s = store();
    s.markRead(CH, C);
    expect(s.isUnread(CH)).toBe(false);
    s.markUnread(CH, B);
    expect(s.isUnread(CH)).toBe(true);
    expect(s.unreads.get(CH)?.lastId).toBe(B);
    // A late echo of the older ack, or a reconnect's unreads, doesn't undo it.
    s.markRead(CH, A);
    s.setUnreads([{ channel: CH, lastId: A, mentions: [] }]);
    expect(s.unreads.get(CH)?.lastId).toBe(B);
    s.markRead(CH, C);
    expect(s.isUnread(CH)).toBe(false);
  });

  it('marks the whole channel unread from its first message', () => {
    const s = store();
    s.markUnread(CH, undefined);
    expect(s.isUnread(CH)).toBe(true);
    expect(s.unreads.get(CH)?.lastId).toBeUndefined();
  });
});
