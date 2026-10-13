import { describe, expect, it } from 'vitest';
import { best, rank } from './rank.ts';

describe('suggestion ranking', () => {
  it('ranks the start of a name, then the start of a word, then anywhere', () => {
    expect(rank('Aino Virtanen', 'ai')).toBe(0);
    expect(rank('Aino Virtanen', 'vir')).toBe(1);
    expect(rank('Maija', 'ai')).toBe(2);
    expect(rank('Maija', 'x')).toBe(-1);
  });

  it('prefers an exact match, then a display-name match over a username match', () => {
    const people = [
      { display: 'Ylläpito', user: 'dev_admin' },
      { display: 'Devon', user: 'devon' },
      { display: 'Dev', user: 'dev' },
    ];
    const names = (p: (typeof people)[number]) => [p.display, p.user];
    expect(best(people, names, 'dev').map((p) => p.display)).toEqual(['Dev', 'Devon', 'Ylläpito']);
    // The same whatever order the members arrive in.
    expect(best([...people].reverse(), names, 'dev').map((p) => p.display)).toEqual(['Dev', 'Devon', 'Ylläpito']);
  });
});
