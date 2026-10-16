import { describe, expect, it } from 'vitest';
import { stepChannel, stepFrom, stepServer, stepUnread } from './stepping.ts';

const list = ['a', 'b', 'c', 'd'];

describe('stepChannel', () => {
  it('moves one step down and up', () => {
    expect(stepChannel(list, 'b', 'down')).toBe('c');
    expect(stepChannel(list, 'c', 'up')).toBe('b');
  });

  it('wraps at both ends', () => {
    expect(stepChannel(list, 'd', 'down')).toBe('a');
    expect(stepChannel(list, 'a', 'up')).toBe('d');
  });

  it('goes to the first with no current channel on Down, and to the last on Up', () => {
    expect(stepChannel(list, null, 'down')).toBe('a');
    expect(stepChannel(list, null, 'up')).toBe('d');
  });

  it('treats a current channel that is not listed as no current channel', () => {
    expect(stepChannel(list, 'zzz', 'down')).toBe('a');
    expect(stepChannel(list, 'zzz', 'up')).toBe('d');
  });

  it('returns nothing when there is no other channel to go to', () => {
    expect(stepChannel([], null, 'down')).toBeUndefined();
    expect(stepChannel(['only'], 'only', 'down')).toBeUndefined();
    expect(stepChannel(['only'], 'only', 'up')).toBeUndefined();
    expect(stepChannel(['only'], null, 'up')).toBe('only');
  });

  it('walks the whole list and comes back to where it started', () => {
    let current: string | null = 'b';
    const seen: string[] = [];
    for (let i = 0; i < list.length; i++) {
      current = stepChannel(list, current, 'down') ?? null;
      seen.push(current!);
    }
    expect(seen).toEqual(['c', 'd', 'a', 'b']);
  });
});

describe('stepUnread', () => {
  const unread = new Set(['b', 'd']);
  const isUnread = (id: string) => unread.has(id);

  it('goes to the next unread channel after the current one, passing over read ones', () => {
    expect(stepUnread(list, 'a', 'down', isUnread)).toBe('b');
    expect(stepUnread(list, 'b', 'down', isUnread)).toBe('d');
    expect(stepUnread(list, 'd', 'up', isUnread)).toBe('b');
  });

  it('wraps to the unread channels at the other end', () => {
    expect(stepUnread(list, 'd', 'down', isUnread)).toBe('b');
    expect(stepUnread(list, 'b', 'up', isUnread)).toBe('d');
  });

  it('starts from the top, or the bottom, when the current channel is not in the list', () => {
    expect(stepUnread(list, null, 'down', isUnread)).toBe('b');
    expect(stepUnread(list, null, 'up', isUnread)).toBe('d');
  });

  it('returns nothing when no other channel is unread', () => {
    expect(stepUnread(list, 'b', 'down', (id) => id === 'b')).toBeUndefined();
    expect(stepUnread(list, 'a', 'down', () => false)).toBeUndefined();
  });
});

describe('stepServer', () => {
  it('steps through the servers in the rail order, and wraps', () => {
    const servers = ['s1', 's2', 's3'];
    expect(stepServer(servers, 's1', 'down')).toBe('s2');
    expect(stepServer(servers, 's1', 'up')).toBe('s3');
    expect(stepServer(servers, 's3', 'down')).toBe('s1');
  });

  it('goes to the first server from the direct messages area on Down, and the last on Up', () => {
    expect(stepServer(['s1', 's2'], null, 'down')).toBe('s1');
    expect(stepServer(['s1', 's2'], null, 'up')).toBe('s2');
  });
});

describe('stepFrom', () => {
  it('takes the eligible items only, and never the current one', () => {
    expect(stepFrom(['x', 'y'], 'x', 'down', () => true)).toBe('y');
    expect(stepFrom(['x'], 'x', 'down', () => true)).toBeUndefined();
  });
});
