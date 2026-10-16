import { describe, expect, it } from 'vitest';
import { movesThisCall, tokenExpiry, tokenUsable } from './move.ts';

const token = (exp: number | undefined) =>
  `${btoa('{"alg":"HS256"}')}.${btoa(JSON.stringify(exp === undefined ? {} : { exp })).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')}.sig`;

describe('tokenExpiry', () => {
  it('reads exp in seconds as milliseconds', () => expect(tokenExpiry(token(1_800_000_000))).toBe(1_800_000_000_000));
  it('is null for a token without exp or one that is not a token', () => {
    expect(tokenExpiry(token(undefined))).toBeNull();
    expect(tokenExpiry('nonsense')).toBeNull();
  });
});

describe('tokenUsable', () => {
  const exp = 1_800_000_000;
  it('is usable until a moment before it expires', () => {
    expect(tokenUsable(token(exp), exp * 1000 - 5_000)).toBe(true);
    expect(tokenUsable(token(exp), exp * 1000 - 1_000)).toBe(false);
    expect(tokenUsable(token(exp), exp * 1000 + 1)).toBe(false);
  });
  it('is tried when it cannot be read', () => expect(tokenUsable('nonsense', Date.now())).toBe(true));
});

describe('movesThisCall', () => {
  it('follows a move out of the current call', () => expect(movesThisCall('A', 'A', null)).toBe(true));
  it('follows a second move, which still names the channel the first one left', () => expect(movesThisCall('A', 'B', 'A')).toBe(true));
  it('ignores a move out of a call this client is not in', () => {
    expect(movesThisCall('A', null, null)).toBe(false);
    expect(movesThisCall('X', 'A', null)).toBe(false);
  });
});
