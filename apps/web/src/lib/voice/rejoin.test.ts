/** The rejoin rule (client.md section 10.7). */
import { DisconnectReason } from 'livekit-client';
import { describe, expect, it } from 'vitest';
import {
  LK_REASON, REJOIN_FOR_MS, REJOIN_GAP_MS, endCause, initial, movedElsewhere, rejoining, shown, step, type CallEvent, type CallState, type Effect,
} from './rejoin.ts';

const C = '01M4WPBMZW1D977DMJNR76RZQE';

/** Run events in order, each at its time, returning the last state and effect. */
function run(events: [number, CallEvent][], from: CallState = initial): [CallState, Effect] {
  let s = from;
  let fx: Effect = null;
  for (const [at, e] of events) [s, fx] = step(s, e, at);
  return [s, fx];
}

/** Joined at 0 and connected at `at`. */
const joined = (at = 500) => run([[0, { type: 'join', channel: C }], [at, { type: 'connected' }]])[0];

describe('the rejoin rule', () => {
  it('copies LiveKit’s disconnect reasons exactly', () => {
    for (const [name, value] of Object.entries(LK_REASON)) expect(DisconnectReason[name as keyof typeof DisconnectReason]).toBe(value);
  });

  it('rejoins after a connection-type end, never after the user or a removal', () => {
    expect(endCause(DisconnectReason.CLIENT_INITIATED)).toBe('user');
    expect(endCause(DisconnectReason.PARTICIPANT_REMOVED)).toBe('removed');
    expect(endCause(DisconnectReason.DUPLICATE_IDENTITY)).toBe('removed');
    for (const r of [DisconnectReason.SIGNAL_CLOSE, DisconnectReason.SERVER_SHUTDOWN, DisconnectReason.ROOM_DELETED, DisconnectReason.JOIN_FAILURE,
      DisconnectReason.CONNECTION_TIMEOUT, DisconnectReason.MEDIA_FAILURE, DisconnectReason.STATE_MISMATCH, DisconnectReason.UNKNOWN_REASON, undefined]) {
      expect(endCause(r)).toBe('connection');
    }
  });

  it('shows connecting, then connected, and leaves to nothing', () => {
    const [first, fx] = step(initial, { type: 'join', channel: C }, 0);
    let s = first;
    expect([shown(s), fx]).toEqual(['connecting', { type: 'connect' }]);
    [s] = step(s, { type: 'connected' }, 300);
    expect(shown(s)).toBe('connected');
    [s] = step(s, { type: 'leave' }, 900);
    expect(shown(s)).toBe('none');
  });

  it('shows LiveKit’s own reconnect as reconnecting, and rejoins nothing for it', () => {
    const [first, fx] = step(joined(), { type: 'reconnecting' }, 20_000);
    let s = first;
    expect([shown(s), fx, rejoining(s)]).toEqual(['reconnecting', null, C]);
    [s] = step(s, { type: 'reconnected' }, 25_000);
    expect([shown(s), rejoining(s)]).toEqual(['connected', null]);
  });

  it('never rejoins after a removal, and says disconnected', () => {
    const [s, fx] = step(joined(), { type: 'ended', cause: 'removed' }, 60_000);
    expect([s.phase, s.reason, fx, rejoining(s)]).toEqual(['disconnected', 'removed', null, null]);
    // A late end of the same call changes nothing.
    expect(step(s, { type: 'ended', cause: 'connection' }, 61_000)[1]).toBeNull();
  });

  it('a user leave ends the call without a rejoin', () => {
    const [s, fx] = step(joined(), { type: 'ended', cause: 'user' }, 60_000);
    expect([s.phase, fx]).toEqual(['idle', null]);
  });

  it('backs off at 1, 2, 5, 10 and 30 s, then keeps at 30 s', () => {
    let [s, fx] = step(joined(), { type: 'ended', cause: 'connection' }, 60_000);
    let now = 60_000;
    const waits: number[] = [];
    for (let i = 0; i < 7; i++) {
      expect(fx?.type).toBe('wait');
      const ms = (fx as { ms: number }).ms;
      waits.push(ms);
      now += ms;
      [s, fx] = step(s, { type: 'retry' }, now);
      expect([shown(s), fx, rejoining(s)]).toEqual(['reconnecting', { type: 'connect' }, C]);
      [s, fx] = step(s, { type: 'failed', final: false }, now + 100);
      now += 100;
    }
    expect(waits).toEqual([1_000, 2_000, 5_000, 10_000, 30_000, 30_000, 30_000]);
  });

  it('gives up after 5 minutes and offers Rejoin', () => {
    let [s, fx] = step(joined(), { type: 'ended', cause: 'connection' }, 60_000);
    let now = 60_000;
    while (fx?.type === 'wait') {
      now += fx.ms;
      [s] = step(s, { type: 'retry' }, now);
      [s, fx] = step(s, { type: 'failed', final: false }, now);
    }
    expect([shown(s), s.reason]).toEqual(['disconnected', 'gave-up']);
    expect(now - 60_000).toBeLessThanOrEqual(REJOIN_FOR_MS);
    // Rejoin is a fresh join, at once.
    [s, fx] = step(s, { type: 'join', channel: C }, now + 1);
    expect([shown(s), fx]).toEqual(['connecting', { type: 'connect' }]);
  });

  it('a rejoin that succeeds is back to connected, and the backoff starts over', () => {
    let [s] = step(joined(), { type: 'ended', cause: 'connection' }, 60_000);
    [s] = step(s, { type: 'retry' }, 61_000);
    [s] = step(s, { type: 'connected' }, 61_500);
    expect([shown(s), s.attempt, rejoining(s)]).toEqual(['connected', 0, null]);
    const [, fx] = step(s, { type: 'ended', cause: 'connection' }, 120_000);
    expect(fx).toEqual({ type: 'wait', ms: 1_000 });
  });

  it('never rejoins within 10 s of the last successful join', () => {
    // Connected at 500 and lost at 2 s: the first rejoin waits until 10.5 s, not 3 s.
    let [s, fx] = step(joined(500), { type: 'ended', cause: 'connection' }, 2_000);
    expect(fx).toEqual({ type: 'wait', ms: 500 + REJOIN_GAP_MS - 2_000 });
    // Rejoined at 11 s and lost again at once: still 10 s from that join.
    [s] = step(s, { type: 'retry' }, 10_500);
    [s] = step(s, { type: 'connected' }, 11_000);
    [s, fx] = step(s, { type: 'ended', cause: 'connection' }, 11_200);
    expect(fx).toEqual({ type: 'wait', ms: 11_000 + REJOIN_GAP_MS - 11_200 });
    // A timer firing early waits out the rest.
    expect(step(s, { type: 'retry' }, 15_000)[1]).toEqual({ type: 'wait', ms: 6_000 });
  });

  it('stops at once when a rejoin is refused for good', () => {
    let [s] = step(joined(), { type: 'ended', cause: 'connection' }, 60_000);
    [s] = step(s, { type: 'retry' }, 61_000);
    const [after, fx] = step(s, { type: 'failed', final: true }, 61_200);
    expect([after.phase, after.reason, fx]).toEqual(['disconnected', 'refused', null]);
  });

  it('a first join that fails goes back to nothing, for the user to retry', () => {
    const [s, fx] = run([[0, { type: 'join', channel: C }], [200, { type: 'failed', final: false }]]);
    expect([shown(s), fx]).toEqual(['none', null]);
  });

  it('leaving while waiting cancels the rejoin', () => {
    let [s] = step(joined(), { type: 'ended', cause: 'connection' }, 60_000);
    [s] = step(s, { type: 'leave' }, 60_500);
    expect(step(s, { type: 'retry' }, 61_000)).toEqual([s, null]);
  });

  it('tells another device taking the call from a kick by a newer join of our own', () => {
    expect(movedElsewhere({ joinedAt: 1 }, { joinedAt: 1 })).toBe(false);
    expect(movedElsewhere({ joinedAt: 1 }, null)).toBe(false);
    expect(movedElsewhere({ joinedAt: 1 }, { joinedAt: 2 })).toBe(true);
    expect(movedElsewhere(null, { joinedAt: 2 })).toBe(true);
  });
});
