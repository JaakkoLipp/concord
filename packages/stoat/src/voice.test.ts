/**
 * Voice state from Stoat (m4-plan.md task 3, client.md section 10.1). The recorded fixtures have no one in
 * voice, so these frames are written by hand to the shapes in Stoat 0.15.5's source (`events/client.rs`,
 * `v0/users.rs` UserVoiceState). The live `voice.ts` check confirms them on the dev stack.
 */
import { Store, memberKey, type User } from '@concord/domain';
import { describe, expect, it } from 'vitest';
import { mapFrames } from './events.ts';

type Frame = { type: string } & Record<string, unknown>;

const self: User = { id: 'ME', username: 'me', discriminator: '0001', badges: 0, flags: 0, online: true, relationship: 'User' };
const participant = (id: string, joined: string, flags: Record<string, boolean> = {}) =>
  ({ id, joined_at: joined, is_receiving: true, is_publishing: false, screensharing: false, camera: false, ...flags });

const ready = (voice: unknown[]): Frame => ({
  type: 'Ready', users: [{ _id: 'ME', username: 'me', discriminator: '0001', relationship: 'User', online: true }],
  servers: [{ _id: 'S', owner: 'ME', name: 'Kylä', channels: ['V1', 'V2'], default_permissions: 0 }],
  channels: [
    { channel_type: 'TextChannel', _id: 'V1', server: 'S', name: 'olohuone', voice: {} },
    { channel_type: 'TextChannel', _id: 'V2', server: 'S', name: 'pelit', voice: { max_users: 5 } },
  ],
  members: [{ _id: { server: 'S', user: 'ME' }, joined_at: '2026-01-01T00:00:00Z', roles: [] }],
  emojis: [], voice_states: voice,
});

function store(voice: unknown[] = []): Store {
  const s = new Store();
  s.self = self;
  apply(s, ready(voice));
  return s;
}
const apply = (s: Store, f: Frame) => mapFrames(f).forEach((e) => s.apply(e));
const who = (s: Store, channel: string) => s.voiceParticipants(channel).map((v) => v.user);

describe('Ready.voice_states', () => {
  it('lists participants by channel, in the order they joined', () => {
    const s = store([
      { id: 'V1', participants: [participant('B', '2026-10-14T18:00:05.250Z'), participant('A', '2026-10-14T18:00:05Z', { is_publishing: true })] },
    ]);
    expect(who(s, 'V1')).toEqual(['A', 'B']);
    expect(s.voiceParticipants('V1')[0]).toEqual({
      user: 'A', channel: 'V1', joinedAt: Date.parse('2026-10-14T18:00:05Z'), publishing: true, receiving: true, screensharing: false, camera: false,
    });
    expect(s.voiceSince('V1')).toBe(Date.parse('2026-10-14T18:00:05Z'));
    expect(s.voiceChannelOf('B')).toBe('V1');
    expect(s.voiceSince('V2')).toBeUndefined();
  });

  it('replaces everything on a new Ready', () => {
    const s = store([{ id: 'V1', participants: [participant('A', '2026-10-14T18:00:00Z')] }]);
    apply(s, ready([{ id: 'V2', participants: [participant('B', '2026-10-14T18:30:00Z')] }]));
    expect(who(s, 'V1')).toEqual([]);
    expect(who(s, 'V2')).toEqual(['B']);
    apply(s, ready([]));
    expect(s.voice.size).toBe(0);
  });
});

describe('voice events', () => {
  it('joins and leaves', () => {
    const s = store();
    apply(s, { type: 'VoiceChannelJoin', id: 'V1', state: participant('A', '2026-10-14T18:00:00Z') });
    apply(s, { type: 'VoiceChannelJoin', id: 'V1', state: participant('B', '2026-10-14T18:01:00Z') });
    expect(who(s, 'V1')).toEqual(['A', 'B']);
    apply(s, { type: 'VoiceChannelLeave', id: 'V1', user: 'A' });
    expect(who(s, 'V1')).toEqual(['B']);
    // The timer counts from the earliest of the people now in it.
    expect(s.voiceSince('V1')).toBe(Date.parse('2026-10-14T18:01:00Z'));
    apply(s, { type: 'VoiceChannelLeave', id: 'V1', user: 'B' });
    expect(s.voice.has('V1')).toBe(false);
    expect(s.voiceSince('V1')).toBeUndefined();
  });

  it('applies a repeated join or leave once', () => {
    const s = store();
    const join = { type: 'VoiceChannelJoin', id: 'V1', state: participant('A', '2026-10-14T18:00:00Z') };
    apply(s, join);
    apply(s, join);
    expect(who(s, 'V1')).toEqual(['A']);
    apply(s, { type: 'VoiceChannelLeave', id: 'V1', user: 'A' });
    apply(s, { type: 'VoiceChannelLeave', id: 'V1', user: 'A' });
    expect(s.voice.size).toBe(0);
  });

  it('moves a user between channels', () => {
    const s = store([{ id: 'V1', participants: [participant('A', '2026-10-14T18:00:00Z'), participant('B', '2026-10-14T18:00:00Z')] }]);
    apply(s, { type: 'VoiceChannelMove', user: 'A', from: 'V1', to: 'V2', state: participant('A', '2026-10-14T18:05:00Z', { is_publishing: true }) });
    expect(who(s, 'V1')).toEqual(['B']);
    expect(who(s, 'V2')).toEqual(['A']);
    expect(s.voiceParticipants('V2')[0]!.publishing).toBe(true);
    expect(s.voiceChannelOf('A')).toBe('V2');
  });

  it('takes a join elsewhere as the leave it missed, and ignores the late leave', () => {
    const s = store([{ id: 'V1', participants: [participant('A', '2026-10-14T18:00:00Z')] }]);
    apply(s, { type: 'VoiceChannelJoin', id: 'V2', state: participant('A', '2026-10-14T18:10:00Z') });
    expect(s.voice.has('V1')).toBe(false);
    expect(who(s, 'V2')).toEqual(['A']);
    apply(s, { type: 'VoiceChannelLeave', id: 'V1', user: 'A' });
    expect(who(s, 'V2')).toEqual(['A']);
  });

  it('decodes the private move event, which the store leaves to the voice controller', () => {
    expect(mapFrames({ type: 'UserMoveVoiceChannel', node: 'worldwide', from: 'V1', to: 'V2', token: 'T' })).toEqual([{ type: 'voiceMoved', from: 'V1', to: 'V2', node: 'worldwide', token: 'T' }]);
    const s = store([{ id: 'V1', participants: [participant('ME', '2026-10-14T18:00:00Z')] }]);
    apply(s, { type: 'UserMoveVoiceChannel', node: 'worldwide', from: 'V1', to: 'V2', token: 'T' });
    // The state changes only with the VoiceChannelMove that follows once the user has connected.
    expect(who(s, 'V1')).toEqual(['ME']);
  });

  it('merges only the flags an update carries', () => {
    const s = store([{ id: 'V1', participants: [participant('A', '2026-10-14T18:00:00Z', { is_publishing: true })] }]);
    apply(s, { type: 'UserVoiceStateUpdate', id: 'A', channel_id: 'V1', data: { screensharing: true } });
    expect(s.voiceParticipants('V1')[0]).toMatchObject({ publishing: true, receiving: true, screensharing: true, camera: false });
    apply(s, { type: 'UserVoiceStateUpdate', id: 'A', channel_id: 'V1', data: { is_publishing: false, camera: true } });
    expect(s.voiceParticipants('V1')[0]).toMatchObject({ publishing: false, receiving: true, screensharing: true, camera: true });
    expect(s.voiceParticipants('V1')[0]!.joinedAt).toBe(Date.parse('2026-10-14T18:00:00Z'));
  });

  it('ignores an update for someone not in that channel', () => {
    const s = store();
    apply(s, { type: 'UserVoiceStateUpdate', id: 'A', channel_id: 'V1', data: { is_publishing: true } });
    expect(s.voice.size).toBe(0);
  });

  it('forgets the states of a deleted channel', () => {
    const s = store([{ id: 'V1', participants: [participant('A', '2026-10-14T18:00:00Z')] }]);
    apply(s, { type: 'ChannelDelete', id: 'V1' });
    expect(s.voiceChannelOf('A')).toBeUndefined();
  });

  it('leaves voice state alone on call ringing and private move events', () => {
    const s = store([{ id: 'V1', participants: [participant('A', '2026-10-14T18:00:00Z')] }]);
    apply(s, { type: 'VoiceCallUpdate', initiator_id: 'A', channel_id: 'D1', started_at: '2026-10-14T18:00:00Z', ended: false });
    apply(s, { type: 'UserMoveVoiceChannel', node: 'worldwide', from: 'V1', to: 'V2', token: 'x' });
    expect(who(s, 'V1')).toEqual(['A']);
  });

  it('accepts a numeric joined_at in seconds', () => {
    const s = store();
    apply(s, { type: 'VoiceChannelJoin', id: 'V1', state: { ...participant('A', ''), joined_at: 1_760_000_000 } });
    expect(s.voiceSince('V1')).toBe(1_760_000_000_000);
  });
});

describe('server mute and deafen', () => {
  const member = (extra: Record<string, unknown>) => ({ _id: { server: 'S', user: 'A' }, joined_at: '2026-01-01T00:00:00Z', roles: [], ...extra });

  it('maps can_publish and can_receive, absent meaning allowed', () => {
    const s = store();
    apply(s, { type: 'ServerMemberJoin', id: 'S', user: 'A', member: member({}) });
    expect(s.members.get(memberKey('S', 'A'))).toMatchObject({ canPublish: true, canReceive: true });
    apply(s, { type: 'ServerMemberJoin', id: 'S', user: 'A', member: member({ can_publish: false, can_receive: false }) });
    expect(s.members.get(memberKey('S', 'A'))).toMatchObject({ canPublish: false, canReceive: false });
  });

  it('follows member updates, including a clear back to the default', () => {
    const s = store();
    apply(s, { type: 'ServerMemberJoin', id: 'S', user: 'A', member: member({}) });
    apply(s, { type: 'ServerMemberUpdate', id: { server: 'S', user: 'A' }, data: { can_publish: false }, clear: [] });
    expect(s.members.get(memberKey('S', 'A'))).toMatchObject({ canPublish: false, canReceive: true });
    apply(s, { type: 'ServerMemberUpdate', id: { server: 'S', user: 'A' }, data: { can_receive: false }, clear: [] });
    expect(s.members.get(memberKey('S', 'A'))).toMatchObject({ canPublish: false, canReceive: false });
    apply(s, { type: 'ServerMemberUpdate', id: { server: 'S', user: 'A' }, data: {}, clear: ['CanPublish', 'CanReceive'] });
    expect(s.members.get(memberKey('S', 'A'))).toMatchObject({ canPublish: true, canReceive: true });
    apply(s, { type: 'ServerMemberUpdate', id: { server: 'S', user: 'A' }, data: { can_publish: false }, clear: [] });
    apply(s, { type: 'ServerMemberUpdate', id: { server: 'S', user: 'A' }, data: { can_publish: true }, clear: [] });
    expect(s.members.get(memberKey('S', 'A'))!.canPublish).toBe(true);
  });
});
