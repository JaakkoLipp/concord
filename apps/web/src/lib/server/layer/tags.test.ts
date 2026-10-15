import { describe, expect, it } from 'vitest';
import { MIGRATIONS } from './migrations.ts';
import { openStore } from './store.ts';
import { removeServerTag, requireTag, serverTags, setServerTag, wear, wornTags } from './tags.ts';
import { LayerError } from './util.ts';

const S1 = '01HZZZZZZZZZZZZZZZZZZZZS01';
const S2 = '01HZZZZZZZZZZZZZZZZZZZZS02';
const E1 = '01HZZZZZZZZZZZZZZZZZZZZE01';
const [A, B] = ['01HZZZZZZZZZZZZZZZZZZZZ00A', '01HZZZZZZZZZZZZZZZZZZZZ00B'];

describe('server tags', () => {
  it('accepts up to 4 letters or digits, in any script', () => {
    expect(requireTag(' SLOP ')).toBe('SLOP');
    expect(requireTag('Äö1')).toBe('Äö1');
    for (const bad of ['', 'TOOLONG', 'A B', 'A-B', '<b>', 'ab:', 5]) expect(() => requireTag(bad)).toThrow(LayerError);
  });

  it('stores a tag, lets members wear it, and disabling it takes it off everyone', () => {
    const db = openStore(':memory:', MIGRATIONS);
    setServerTag(db, { server: S1, tag: 'SLOP', emoji: E1 }, A);
    expect(serverTags(db, [S1, S2])).toEqual({ [S1]: { server: S1, tag: 'SLOP', emoji: E1 } });
    wear(db, A, S1);
    wear(db, B, S1);
    expect(Object.keys(wornTags(db, [A, B]))).toEqual([A, B]);
    setServerTag(db, { server: S1, tag: 'NEW', emoji: E1 }, A);
    expect(wornTags(db, [A])[A]?.tag).toBe('NEW');
    wear(db, B, null);
    expect(wornTags(db, [B])).toEqual({});
    removeServerTag(db, S1);
    expect(wornTags(db, [A, B])).toEqual({});
  });

  it('refuses to wear a tag that doesn’t exist', () => {
    const db = openStore(':memory:', MIGRATIONS);
    expect(() => wear(db, A, S2)).toThrow();
  });
});
