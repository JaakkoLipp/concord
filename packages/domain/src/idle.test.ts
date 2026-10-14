/** Automatic idle (m2b-plan.md task 6), on fake timers. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Presence } from './entities.ts';
import { ACTIVE_EVERY_MS, AWAY_MS, IdleTracker } from './idle.ts';

function setup(chosen: Presence | null = 'Online', presence: Presence = 'Online') {
  const state = { chosen, presence, sets: [] as string[], actives: [] as number[], inCall: false };
  const t = new IdleTracker({
    now: () => Date.now(),
    presence: () => state.presence,
    chosen: () => state.chosen,
    setPresence: (p) => { state.sets.push(p); state.presence = p; t.presenceChanged(); },
    writeActive: (at) => state.actives.push(at),
    inCall: () => state.inCall,
  });
  t.start();
  return { t, state };
}
const minutes = (n: number) => vi.advanceTimersByTime(n * 60_000);

describe('IdleTracker', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }));
  afterEach(() => vi.useRealTimers());

  it('goes Idle after 10 minutes alone, once, and back Online on input', () => {
    const { t, state } = setup();
    minutes(9);
    expect(state.sets).toEqual([]);
    minutes(1);
    expect(state.sets).toEqual(['Idle']);
    minutes(30);
    expect(state.sets).toEqual(['Idle']);
    t.input();
    expect(state.sets).toEqual(['Idle', 'Online']);
    expect(state.actives).toHaveLength(1);
  });

  it('stays Online while another device is used, and goes Idle 10 minutes after it stops', () => {
    const { t, state } = setup();
    for (let i = 0; i < 5; i++) {
      minutes(4);
      t.remote();
    }
    expect(state.sets).toEqual([]);
    minutes(9);
    expect(state.sets).toEqual([]);
    minutes(1);
    expect(state.sets).toEqual(['Idle']);
  });

  it('restores Online on input whoever set Idle, while the chosen status is Online', () => {
    const { t, state } = setup('Online', 'Idle');
    t.input();
    expect(state.sets).toEqual(['Online']);
  });

  it('never touches a chosen status, from this menu or another client', () => {
    const busy = setup('Busy', 'Busy');
    minutes(60);
    busy.t.input();
    expect(busy.state.sets).toEqual([]);
    const idle = setup('Idle', 'Idle');
    idle.t.input();
    expect(idle.state.sets).toEqual([]);
    const elsewhere = setup(null, 'Focus');
    minutes(60);
    expect(elsewhere.state.sets).toEqual([]);
  });

  it('writes concord:active at most every 4 minutes while in use, and at once after being away', () => {
    const { t, state } = setup();
    t.input();
    for (let i = 0; i < 30; i++) {
      vi.advanceTimersByTime(10_000);
      t.input();
    }
    // 5 minutes of input: the first write, then one after 4 minutes.
    expect(state.actives).toHaveLength(2);
    minutes(10);
    t.input();
    expect(state.actives).toHaveLength(3);
    expect(state.actives[2]! - state.actives[1]!).toBeLessThan(ACTIVE_EVERY_MS + AWAY_MS);
  });

  it('takes a written concord:active at start-up, but never one from the future', () => {
    const { t, state } = setup();
    minutes(8);
    t.remote(Date.now() + 60 * 60_000);
    minutes(9);
    expect(state.sets).toEqual([]);
    minutes(1);
    expect(state.sets).toEqual(['Idle']);
  });

  it('counts another device turning Idle into Online as activity, before its notice arrives', () => {
    const { t, state } = setup();
    minutes(10);
    expect(state.sets).toEqual(['Idle']);
    minutes(5);
    // Another device came back: Stoat's event arrives here before its activity notice.
    state.presence = 'Online';
    t.presenceChanged();
    minutes(9);
    expect(state.sets).toEqual(['Idle']);
    minutes(1);
    expect(state.sets).toEqual(['Idle', 'Idle']);
  });

  it('counts a call as use, and starts the 10 minutes when it ends', () => {
    const { state } = setup();
    state.inCall = true;
    minutes(90);
    expect(state.sets).toEqual([]);
    // A call writes nothing: other devices see it in Stoat's voice states.
    expect(state.actives).toEqual([]);
    state.inCall = false;
    minutes(10);
    expect(state.sets).toEqual([]);
    minutes(1);
    expect(state.sets).toEqual(['Idle']);
  });

  it('does nothing until started', () => {
    const state = { sets: [] as string[] };
    const t = new IdleTracker({ now: () => Date.now(), presence: () => 'Idle', chosen: () => 'Online', setPresence: (p) => state.sets.push(p), writeActive: () => {} });
    t.input();
    minutes(20);
    expect(state.sets).toEqual([]);
  });
});
