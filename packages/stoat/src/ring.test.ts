/**
 * DM and group calls ringing (m4-plan.md task 8, client.md section 10.8). The frames are written by hand to the
 * shapes in Stoat 0.15.5's source (`events/client.rs` VoiceCallUpdate, `voice-ingress/src/api.rs`); the live
 * `dm-call.ts` check confirms them on the dev stack.
 */
import { Session, Store, type Backend, type DomainEvent, type User } from '@concord/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mapFrames } from './events.ts';

type Frame = { type: string } & Record<string, unknown>;

const self: User = { id: 'ME', username: 'me', discriminator: '0001', badges: 0, flags: 0, online: true, relationship: 'User' };
const participant = (id: string, joined: string) => ({ id, joined_at: joined, is_receiving: true, is_publishing: false, screensharing: false, camera: false });
const STARTED = '2026-10-14T18:00:00Z';

const ready = (voice: unknown[] = []): Frame => ({
  type: 'Ready', users: [{ _id: 'ME', username: 'me', discriminator: '0001', relationship: 'User', online: true }],
  servers: [], members: [], emojis: [],
  channels: [
    { channel_type: 'DirectMessage', _id: 'D1', active: true, recipients: ['ME', 'A'] },
    { channel_type: 'Group', _id: 'G1', name: 'Porukka', owner: 'A', recipients: ['ME', 'A', 'B'] },
  ],
  voice_states: voice,
});
const ring = (channel: string, initiator = 'A', started = STARTED): Frame =>
  ({ type: 'VoiceCallUpdate', initiator_id: initiator, channel_id: channel, started_at: started, ended: false });
const ended = (channel: string, by = 'A'): Frame => ({ type: 'VoiceCallUpdate', initiator_id: by, channel_id: channel, started_at: null, ended: true });
const join = (channel: string, user: string, at = STARTED): Frame => ({ type: 'VoiceChannelJoin', id: channel, state: participant(user, at) });
const leave = (channel: string, user: string): Frame => ({ type: 'VoiceChannelLeave', id: channel, user });

function store(voice: unknown[] = []): Store {
  const s = new Store();
  s.self = self;
  apply(s, ready(voice));
  return s;
}
const apply = (s: Store, f: Frame) => mapFrames(f).forEach((e) => s.apply(e));

describe('VoiceCallUpdate', () => {
  it('maps a ring and an end', () => {
    expect(mapFrames(ring('D1'))).toEqual([{ type: 'callUpdate', channel: 'D1', initiator: 'A', startedAt: Date.parse(STARTED), ended: false }]);
    expect(mapFrames(ended('D1', 'B'))).toEqual([{ type: 'callUpdate', channel: 'D1', initiator: 'B', ended: true }]);
  });

  it('rings until the call ends, whoever leaves last', () => {
    const s = store();
    apply(s, ring('G1'));
    expect(s.rings.get('G1')).toEqual({ channel: 'G1', initiator: 'A', startedAt: Date.parse(STARTED) });
    // The end names the last to leave, not the caller.
    apply(s, ended('G1', 'B'));
    expect(s.rings.size).toBe(0);
  });

  it('applies a repeated ring once, keeping the same entry', () => {
    const s = store();
    apply(s, ring('D1'));
    const first = s.rings.get('D1');
    apply(s, ring('D1'));
    expect(s.rings.get('D1')).toBe(first);
  });

  it('stops when this account joins the call, here or on another device, and the call does not ring again', () => {
    const s = store();
    apply(s, join('D1', 'A'));
    apply(s, ring('D1'));
    apply(s, join('D1', 'ME', '2026-10-14T18:00:05Z'));
    expect(s.rings.size).toBe(0);
    apply(s, ring('D1'));
    expect(s.rings.size).toBe(0);
  });

  it('does not ring for a call this account is already in, or its own', () => {
    const s = store([{ id: 'D1', participants: [participant('ME', STARTED)] }]);
    apply(s, ring('D1'));
    apply(s, ring('G1', 'ME'));
    expect(s.rings.size).toBe(0);
  });

  it('keeps an ignored call quiet, but rings for the next call in the same channel', () => {
    const s = store();
    apply(s, ring('D1'));
    s.stopRing('D1');
    apply(s, ring('D1'));
    expect(s.rings.size).toBe(0);
    apply(s, ring('D1', 'A', '2026-10-14T18:05:00Z'));
    expect(s.rings.get('D1')?.startedAt).toBe(Date.parse('2026-10-14T18:05:00Z'));
  });

  it('rings even when the caller\'s join arrives after the ring', () => {
    const s = store();
    apply(s, ring('D1'));
    apply(s, join('D1', 'A'));
    expect(s.rings.has('D1')).toBe(true);
  });

  it('stops when the call empties, even without the end event', () => {
    const s = store();
    apply(s, join('D1', 'A'));
    apply(s, ring('D1'));
    apply(s, leave('D1', 'A'));
    expect(s.rings.size).toBe(0);
  });

  it('drops a ring on Ready when the call emptied while disconnected, and keeps one still running', () => {
    const s = store();
    apply(s, ring('D1'));
    apply(s, ring('G1'));
    apply(s, ready([{ id: 'G1', participants: [participant('A', STARTED)] }]));
    expect([...s.rings.keys()]).toEqual(['G1']);
  });

  it('forgets the ring of a group this account left', () => {
    const s = store();
    apply(s, ring('G1'));
    apply(s, { type: 'ChannelDelete', id: 'G1' });
    expect(s.rings.size).toBe(0);
  });
});

describe('call_started', () => {
  it('takes the finish time Stoat writes into the line when the call empties', () => {
    const s = store();
    apply(s, { type: 'Message', _id: '01CALL0000000000000000000A', channel: 'D1', author: '00000000000000000000000000', system: { type: 'call_started', by: 'A', finished_at: null } });
    expect(s.messages.get('01CALL0000000000000000000A')?.system).toEqual({ type: 'call_started', by: 'A' });
    apply(s, { type: 'MessageUpdate', id: '01CALL0000000000000000000A', channel: 'D1', data: { system: { type: 'call_started', by: 'A', finished_at: '2026-10-14T18:10:00Z' } } });
    expect(s.messages.get('01CALL0000000000000000000A')?.system).toEqual({ type: 'call_started', by: 'A', finishedAt: '2026-10-14T18:10:00Z' });
  });
});

describe('the ring timeout', () => {
  afterEach(() => void vi.useRealTimers());

  /** A session fed frames through a fake socket. */
  async function session() {
    let onEvent: (e: DomainEvent) => void = () => {};
    const backend = {
      capabilities: { serverSubscribe: true },
      setToken: () => {},
      root: async () => null,
      self: async () => self,
      connect: (h: { onEvent: (e: DomainEvent) => void }) => { onEvent = h.onEvent; return { close: () => {} }; },
    } as unknown as Backend;
    const s = new Session(backend);
    await s.start('token', () => {});
    const send = (f: Frame) => mapFrames(f).forEach(onEvent);
    send(ready());
    return { s, send };
  }

  it('stops a ring after 30 s from when it was heard, and a repeat does not extend it', async () => {
    vi.useFakeTimers();
    const { s, send } = await session();
    send(ring('D1'));
    vi.advanceTimersByTime(20_000);
    send(ring('D1'));
    vi.advanceTimersByTime(9_000);
    expect(s.store.rings.has('D1')).toBe(true);
    vi.advanceTimersByTime(1_000);
    expect(s.store.rings.has('D1')).toBe(false);
    // Rung out: a late repeat stays quiet.
    send(ring('D1'));
    expect(s.store.rings.has('D1')).toBe(false);
    await s.stop();
  });

  it('times a new call in the same channel afresh', async () => {
    vi.useFakeTimers();
    const { s, send } = await session();
    send(ring('D1'));
    vi.advanceTimersByTime(25_000);
    send(ended('D1'));
    send(ring('D1', 'A', '2026-10-14T18:05:00Z'));
    vi.advanceTimersByTime(25_000);
    expect(s.store.rings.has('D1')).toBe(true);
    vi.advanceTimersByTime(5_000);
    expect(s.store.rings.has('D1')).toBe(false);
    await s.stop();
  });
});
