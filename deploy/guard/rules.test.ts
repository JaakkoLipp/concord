/** The history guard's limits (m4.7-plan.md task 12): what strips someone's roles, what only alerts. */
import { describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS, judge, limitsFrom, prune, tallies, ulidTime, type Tally, type WireEntry } from './rules.ts';

const MIN = 60_000;
const at = (minutes: number): number => Date.UTC(2026, 9, 18, 12) + minutes * MIN;
const tally = (kind: Tally['kind'], minutes: number, n = 1, user = 'MOD'): Tally => ({ user, kind, at: at(minutes), n, entry: String(minutes) });

/** Runs tallies through the rules in order, as the guard does, and returns each verdict's action. */
function run(list: Tally[]): string[] {
  const history: Tally[] = [];
  return list.map((t) => {
    const v = judge(history, t, DEFAULT_LIMITS);
    history.push(t);
    return v.action;
  });
}

describe('judge', () => {
  it('strips on the 26th of others’ messages in 10 minutes, not before', () => {
    const verdicts = run(Array.from({ length: 30 }, (_, i) => tally('message', i * 0.1)));
    expect(verdicts.indexOf('strip')).toBe(25);
  });

  it('lets 25 an hour through for hours, and strips past 150 in a day', () => {
    const verdicts = run(Array.from({ length: 160 }, (_, i) => tally('message', i * 9)));
    expect(verdicts.indexOf('strip')).toBe(150);
  });

  it('counts a bulk deletion’s messages, and strips the second bulk deletion in 10 minutes', () => {
    expect(run([tally('bulk', 0), tally('bulk', 5)])).toEqual(['none', 'strip']);
    expect(run([tally('bulk', 0), tally('bulk', 11)])).toEqual(['none', 'none']);
    expect(run([tally('message', 0, 20), tally('message', 1, 20)])).toEqual(['none', 'strip']);
  });

  it('only alerts on a first channel deletion, and strips the second in a day', () => {
    expect(run([tally('channel', 0), tally('channel', 600)])).toEqual(['alert', 'strip']);
    expect(run([tally('channel', 0), tally('channel', 25 * 60)])).toEqual(['alert', 'alert']);
  });

  it('strips more than 3 bans in 10 minutes, and any role deletion', () => {
    expect(run([0, 1, 2, 3].map((m) => tally('ban', m)))).toEqual(['none', 'none', 'none', 'strip']);
    expect(run([tally('role', 0)])).toEqual(['strip']);
  });

  it('counts each person apart', () => {
    const verdicts = run(Array.from({ length: 40 }, (_, i) => tally('message', i * 0.1, 1, i % 2 ? 'A' : 'B')));
    expect(verdicts).not.toContain('strip');
  });

  it('judges by the entries’ own times, so catching up after a restart gives the same answer', () => {
    const late = Array.from({ length: 30 }, (_, i) => tally('message', i * 0.1));
    expect(run(late).indexOf('strip')).toBe(25);
  });
});

describe('tallies', () => {
  const id = '01JAAAAAAAAAAAAAAAAAAAAAAA';
  it('reads deletions, bans and role deletions, and nothing else', () => {
    const e = (type: string, extra: object = {}): WireEntry => ({ _id: id, user: 'U', action: { type, ...extra } });
    expect(tallies(e('MessageBulkDelete', { channel: 'C', count: 40 })).map((t) => [t.kind, t.n])).toEqual([['bulk', 1], ['message', 40]]);
    expect(tallies(e('MessageDelete', { channel: 'C' }))[0]).toMatchObject({ kind: 'message', n: 1, channel: 'C', at: ulidTime(id) });
    expect(tallies(e('MemberEdit'))).toEqual([]);
  });
});

describe('limits and pruning', () => {
  it('reads limits from host.env, keeping the defaults for nonsense', () => {
    expect(limitsFrom({ GUARD_MESSAGES_10M: '10', GUARD_BANS_10M: 'many' })).toEqual({ ...DEFAULT_LIMITS, messages10m: 10 });
    // As compose passes an unset one.
    expect(limitsFrom({ GUARD_MESSAGES_10M: '', GUARD_BULK_10M: ' ', GUARD_BANS_10M: '0' })).toEqual({ ...DEFAULT_LIMITS, bans10m: 0 });
  });
  it('forgets what is older than a day', () => {
    expect(prune([tally('message', 0), tally('message', 2000)], at(2000) + MIN).map((t) => t.entry)).toEqual(['2000']);
  });
});
