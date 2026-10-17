import { describe, expect, it } from 'vitest';
import { COLLAPSED_PER_SERVER, COLLAPSED_SERVERS, parseCollapsed } from './collapsed.svelte.ts';

describe('parseCollapsed', () => {
  it('keeps lists of category IDs per server and drops bad data', () => {
    expect(parseCollapsed('x')).toEqual({});
    expect(parseCollapsed([['s', ['c']]])).toEqual({});
    expect(parseCollapsed({ s1: ['c1', 'c1', 3, '', 'c2'], s2: 'c3', s3: [] })).toEqual({ s1: ['c1', 'c2'] });
  });

  it('caps the servers and the categories per server, keeping the latest', () => {
    const many = Object.fromEntries(Array.from({ length: COLLAPSED_SERVERS + 3 }, (_, i) => [`s${i}`, ['c']]));
    const kept = parseCollapsed(many);
    expect(Object.keys(kept)).toHaveLength(COLLAPSED_SERVERS);
    expect(kept.s0).toBeUndefined();
    const cats = Array.from({ length: COLLAPSED_PER_SERVER + 1 }, (_, i) => `c${i}`);
    expect(parseCollapsed({ s: cats }).s).toEqual(cats.slice(1));
  });
});
