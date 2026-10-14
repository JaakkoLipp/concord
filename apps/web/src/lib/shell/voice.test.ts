/** The voice channel timer and participant icons (m4-plan.md task 3). */
import { Store, type VoiceState } from '@concord/domain';
import { describe, expect, it } from 'vitest';
import { elapsed, voiceMarks } from './voice.ts';

describe('elapsed', () => {
  it('counts minutes, then hours', () => {
    expect(elapsed(0)).toBe('0:00');
    expect(elapsed(42_900)).toBe('0:42');
    expect(elapsed(59 * 60_000 + 59_000)).toBe('59:59');
    expect(elapsed(3600_000)).toBe('1:00:00');
    expect(elapsed((1 * 3600 + 49 * 60 + 52) * 1000)).toBe('1:49:52');
  });

  it('never goes negative', () => {
    expect(elapsed(-5000)).toBe('0:00');
  });
});

describe('voiceMarks', () => {
  const v: VoiceState = { user: 'A', channel: 'V', joinedAt: 0, publishing: false, receiving: true, screensharing: true, camera: false };
  const member = { server: 'S', user: 'A', joinedAt: '', roles: [], canPublish: true, canReceive: true };

  it('shows a self mute, unless a server mute replaces it', () => {
    const s = new Store();
    s.upsertMembers([member]);
    expect(voiceMarks(s, v, 'S')).toEqual({ muted: true, serverMuted: false, serverDeafened: false, camera: false, live: true });
    s.upsertMembers([{ ...member, canPublish: false, canReceive: false }]);
    expect(voiceMarks(s, v, 'S')).toMatchObject({ muted: false, serverMuted: true, serverDeafened: true });
  });

  it('has no server marks in a DM or group', () => {
    expect(voiceMarks(new Store(), { ...v, publishing: true }, undefined)).toMatchObject({ muted: false, serverMuted: false, serverDeafened: false });
  });
});
