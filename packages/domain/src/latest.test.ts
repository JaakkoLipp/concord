/** Merged order writes (m2c-plan.md tasks 3 and 4): five quick changes, two writes, the last one wins. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOLD_MS, Latest } from './latest.ts';

describe('Latest', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('writes the first value, then only the newest of those that waited', async () => {
    const written: number[] = [];
    const l = new Latest<number>(async (v) => { await new Promise((r) => setTimeout(r, 100)); written.push(v); });
    const all = [1, 2, 3, 4, 5].map((v) => l.set(v));
    expect(l.holding).toBe(true);
    await vi.advanceTimersByTimeAsync(300);
    await Promise.all(all);
    expect(written).toEqual([1, 5]);
    // Echoes arriving just after the last write are still held off.
    expect(l.holding).toBe(true);
    await vi.advanceTimersByTimeAsync(HOLD_MS);
    expect(l.holding).toBe(false);
  });

  it('rejects the callers whose write failed, and carries on with newer ones', async () => {
    const l = new Latest<number>(async (v) => { await new Promise((r) => setTimeout(r, 10)); if (v === 1) throw new Error('no'); });
    const first = l.set(1).catch((e: unknown) => e);
    const second = l.set(2);
    await vi.advanceTimersByTimeAsync(50);
    expect(await first).toBeInstanceOf(Error);
    await expect(second).resolves.toBeUndefined();
  });
});
