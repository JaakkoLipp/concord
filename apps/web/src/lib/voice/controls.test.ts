/** Mute and deafen, the join and leave sounds' bookkeeping, and the panel's ping and loss. */
import { describe, expect, it } from 'vitest';
import { CONTROLS, clampVolume, setReceiving, toggleDeafen, toggleMute } from './controls.ts';
import { Peers } from './peers.ts';
import { lossBetween, sample } from './stats.ts';

describe('mute and deafen', () => {
  it('deafen mutes too, and undeafen restores the mute from before', () => {
    const deaf = toggleDeafen(CONTROLS);
    expect(deaf).toMatchObject({ muted: true, deafened: true });
    expect(toggleDeafen(deaf)).toMatchObject({ muted: false, deafened: false });
    const mutedThenDeaf = toggleDeafen(toggleMute(CONTROLS));
    expect(toggleDeafen(mutedThenDeaf)).toMatchObject({ muted: true, deafened: false });
  });

  it('unmuting while deafened undeafens', () => {
    expect(toggleMute(toggleDeafen(toggleMute(CONTROLS)))).toMatchObject({ muted: false, deafened: false });
  });

  it('deafen reaches every remote audio publication, screen-share audio included', () => {
    const calls: [string, boolean][] = [];
    const pub = (name: string) => ({ setEnabled: (on: boolean) => calls.push([name, on]) });
    const people = [
      { audioTrackPublications: new Map([['m1', pub('a mic')], ['s1', pub('a screen audio')]]) },
      { audioTrackPublications: new Map([['m2', pub('b mic')]]) },
    ];
    setReceiving(people, false);
    expect(calls).toEqual([['a mic', false], ['a screen audio', false], ['b mic', false]]);
  });

  it('caps volume at the platform maximum', () => {
    expect(clampVolume(1.7, 2)).toBe(1.7);
    expect(clampVolume(1.7, 1)).toBe(1);
    expect(clampVolume(-1, 2)).toBe(0);
    expect(clampVolume(Number.NaN, 2)).toBe(1);
  });
});

describe('join and leave sounds', () => {
  it('sounds for real arrivals and departures only', () => {
    const p = new Peers();
    p.seed(['a']);
    expect(p.joined('a', true)).toBe(false);
    expect(p.joined('b', true)).toBe(true);
    expect(p.left('b', true)).toBe(true);
    expect(p.left('b', true)).toBe(false);
  });

  it('holds sounds back through a full restart, and drops who left meanwhile silently', () => {
    const p = new Peers();
    p.seed(['a', 'b']);
    // The restart tears everyone down while the call is down, then announces them again once it is up.
    expect(p.left('a', false)).toBe(false);
    expect(p.left('b', false)).toBe(false);
    expect(p.joined('a', true)).toBe(false);
    p.reconcile(['a']);
    expect(p.joined('b', true)).toBe(true);
  });
});

describe('ping and loss', () => {
  it('reads round-trip time from the selected pair, and loss between samples', () => {
    const at = (sent: number, lost: number) => sample([
      { type: 'candidate-pair', nominated: true, currentRoundTripTime: 0.042 },
      { type: 'outbound-rtp', packetsSent: sent },
      { type: 'remote-inbound-rtp', packetsLost: lost },
    ]);
    const a = at(1000, 10);
    const b = at(2000, 30);
    expect(b.rtt).toBe(42);
    expect(lossBetween(a, b)).toBe(2);
    expect(lossBetween(b, b)).toBeUndefined();
  });

  it('counts a receiver’s loss against what was expected', () => {
    const s = sample([{ type: 'inbound-rtp', packetsReceived: 95, packetsLost: 5 }]);
    expect(lossBetween(undefined, s)).toBe(5);
  });
});
