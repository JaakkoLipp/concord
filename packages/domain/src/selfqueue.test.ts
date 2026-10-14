/** The PATCH /users/@me queue (m2b-plan.md task 5). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SelfEdit } from './backend.ts';
import { BackendError } from './errors.ts';
import { SELF_EVERY_MS, SelfQueue, mergeEdit } from './selfqueue.ts';

describe('mergeEdit', () => {
  it('lets the newer value win, and a value and a removal cancel each other', () => {
    expect(mergeEdit({ presence: 'Idle', statusText: 'a' }, { presence: 'Busy' })).toEqual({ presence: 'Busy', statusText: 'a' });
    expect(mergeEdit({ statusText: 'a' }, { remove: ['statusText'] })).toEqual({ remove: ['statusText'] });
    expect(mergeEdit({ remove: ['statusText', 'bio'] }, { statusText: 'b' })).toEqual({ statusText: 'b', remove: ['bio'] });
  });
});

describe('SelfQueue', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }));
  afterEach(() => vi.useRealTimers());

  it('sends the first change at once and merges a burst into one later write', async () => {
    const sent: SelfEdit[] = [];
    const q = new SelfQueue(async (e) => { sent.push(e); });
    const all = [q.push({ presence: 'Online' })];
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toEqual([{ presence: 'Online' }]);
    for (const presence of ['Idle', 'Busy', 'Focus', 'Online'] as const) {
      all.push(q.push({ presence }));
      await vi.advanceTimersByTimeAsync(300);
    }
    expect(sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(SELF_EVERY_MS);
    expect(sent).toEqual([{ presence: 'Online' }, { presence: 'Online' }]);
    await Promise.all(all);
  });

  it('keeps a profile save waiting when a status change joins it', async () => {
    const sent: SelfEdit[] = [];
    const q = new SelfQueue(async (e) => { sent.push(e); });
    void q.push({ presence: 'Idle' });
    await vi.advanceTimersByTimeAsync(0);
    void q.push({ displayName: 'Uusi nimi', bio: 'Moi' });
    void q.push({ presence: 'Online' });
    await vi.advanceTimersByTimeAsync(SELF_EVERY_MS);
    expect(sent[1]).toEqual({ displayName: 'Uusi nimi', bio: 'Moi', presence: 'Online' });
  });

  it('tries again after a 429, under anything newer, and rejects other errors', async () => {
    let calls = 0;
    const sent: SelfEdit[] = [];
    const q = new SelfQueue(async (e) => {
      calls++;
      if (calls === 1) throw new BackendError(429, 'RateLimited', 'slow down');
      if (e.displayName === 'x') throw new BackendError(400, 'FailedValidation', 'too short');
      sent.push(e);
    });
    const first = q.push({ presence: 'Busy' });
    await vi.advanceTimersByTimeAsync(0);
    void q.push({ statusText: 'kiire' });
    await vi.advanceTimersByTimeAsync(SELF_EVERY_MS);
    await first;
    expect(sent).toEqual([{ presence: 'Busy', statusText: 'kiire' }]);
    const bad = q.push({ displayName: 'x' });
    const caught = bad.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(SELF_EVERY_MS);
    expect(await caught).toBeInstanceOf(BackendError);
  });
});

describe('SelfQueue after sign-out', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }));
  afterEach(() => vi.useRealTimers());

  it('rejects what waits and never retries a write that was on its way', async () => {
    const sent: SelfEdit[] = [];
    let refuse: () => void = () => {};
    const q = new SelfQueue((e) => {
      sent.push(e);
      return new Promise<void>((_, reject) => (refuse = () => reject(new BackendError(429, 'RateLimited', 'slow down'))));
    });
    const flying = q.push({ presence: 'Idle' }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(0);
    // The first write is on its way when sign-out clears the queue, then Stoat answers 429.
    const waiting = q.push({ statusText: 'x' }).catch((e: unknown) => e);
    q.clear();
    refuse();
    await vi.advanceTimersByTimeAsync(SELF_EVERY_MS * 3);
    expect(sent).toHaveLength(1);
    expect(await flying).toBeInstanceOf(BackendError);
    expect(await waiting).toBeInstanceOf(Error);
  });
});
