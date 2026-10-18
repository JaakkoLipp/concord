import { describe, expect, it } from 'vitest';
import type { Message } from '@concord/domain';
import { ulidFloor } from '@concord/domain';
import { bounds, collect, dayStart } from './find.ts';

const msg = (n: number, author: string) => ({ id: `ID${String(n).padStart(4, '0')}`, author }) as Message;

describe('search filters', () => {
  it('turns days into exclusive ID bounds at local midnight', () => {
    const oct17 = new Date(2026, 9, 17).getTime();
    expect(dayStart('2026-10-17')).toBe(oct17);
    expect(dayStart('2026-10-31', 1)).toBe(new Date(2026, 10, 1).getTime());
    expect(dayStart('17.10.2026')).toBeUndefined();
    expect(bounds({ before: '2026-10-17', after: '2026-10-16' })).toEqual({ before: ulidFloor(oct17), after: ulidFloor(oct17) });
    expect(bounds({})).toEqual({});
  });

  it('makes a bound that sorts below every ID from that millisecond on', () => {
    const t = Date.UTC(2026, 9, 17, 12);
    expect(ulidFloor(t)).toHaveLength(26);
    expect(ulidFloor(t) < ulidFloor(t + 1)).toBe(true);
    expect(ulidFloor(t).slice(0, 10)).toBe(ulidFloor(t + 0.4).slice(0, 10));
  });

  it('pages until it has enough matches, and says where to go on', async () => {
    // 10 pages of 4, newest first; every third message is from "a".
    const all = Array.from({ length: 40 }, (_, i) => msg(40 - i, i % 3 === 0 ? 'a' : 'b'));
    const asked: (string | undefined)[] = [];
    const page = async (before: string | undefined) => {
      asked.push(before);
      const from = before ? all.findIndex((m) => m.id === before) + 1 : 0;
      return all.slice(from, from + 4);
    };
    const r = await collect(page, { limit: 4, want: 3, maxPages: 10, keep: (m) => m.author === 'a' });
    expect(r.matches.map((m) => m.id)).toEqual(['ID0040', 'ID0037', 'ID0034']);
    expect(r.scanned).toBe(8);
    expect(r.next).toBe('ID0033');
    expect(asked).toEqual([undefined, 'ID0037']);
  });

  it('stops at a short page or the page budget', async () => {
    const short = await collect(async () => [msg(2, 'b'), msg(1, 'b')], { limit: 4, want: 3, maxPages: 10, keep: (m) => m.author === 'a' });
    expect(short).toEqual({ matches: [], scanned: 2, next: undefined });
    let calls = 0;
    const full = async () => (calls++, [msg(4, 'b'), msg(3, 'b'), msg(2, 'b'), msg(1, 'b')]);
    const budget = await collect(full, { limit: 4, want: 3, maxPages: 5, keep: (m) => m.author === 'a' });
    expect(calls).toBe(5);
    expect(budget.scanned).toBe(20);
    expect(budget.next).toBe('ID0001');
  });
});
