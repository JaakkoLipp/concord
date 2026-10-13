/**
 * M2b's store rules (m2b-plan.md task 1), fed with frames shaped as the planning probes recorded them on
 * Stoat 0.15.5.
 */
import { Store, type User } from '@concord/domain';
import { describe, expect, it } from 'vitest';
import { mapFrames } from './events.ts';

type Frame = { type: string } & Record<string, unknown>;

const self: User = { id: 'ME', username: 'me', discriminator: '0001', badges: 0, flags: 0, online: true, relationship: 'User' };
const lotta: User = {
  id: 'LOTTA', username: 'lotta', discriminator: '1234', displayName: 'Lotta', pronouns: 'she/her', badges: 0, flags: 0,
  online: true, presence: 'Busy', statusText: '🎮 pelaan', relationship: 'Friend',
};

function store(): Store {
  const s = new Store();
  s.self = self;
  s.upsertUsers([self, lotta]);
  return s;
}
const apply = (s: Store, f: Frame) => mapFrames(f).forEach((e) => s.apply(e));

describe('UserUpdate', () => {
  it('replaces status whole: a presence-only status drops the text', () => {
    const s = store();
    apply(s, { type: 'UserUpdate', id: 'LOTTA', data: { status: { presence: 'Online' } }, clear: ['StatusText'] });
    expect(s.users.get('LOTTA')).toMatchObject({ presence: 'Online' });
    expect(s.users.get('LOTTA')!.statusText).toBeUndefined();
    // The same without Stoat's clear: the missing text still goes, because status arrives whole.
    apply(s, { type: 'UserUpdate', id: 'LOTTA', data: { status: { text: 'moi', presence: 'Idle' } } });
    apply(s, { type: 'UserUpdate', id: 'LOTTA', data: { status: { presence: 'Focus' } } });
    expect(s.users.get('LOTTA')!.statusText).toBeUndefined();
  });

  it('keeps an empty string as a value', () => {
    const s = store();
    apply(s, { type: 'UserUpdate', id: 'LOTTA', data: { status: { text: '', presence: 'Idle' } } });
    expect(s.users.get('LOTTA')!.statusText).toBe('');
  });

  it('applies every clear field', () => {
    const s = store();
    apply(s, { type: 'UserUpdate', id: 'LOTTA', data: {}, clear: ['DisplayName', 'Pronouns', 'Avatar'] });
    const u = s.users.get('LOTTA')!;
    expect(u.displayName).toBeUndefined();
    expect(u.pronouns).toBeUndefined();
  });

  it('marks someone online when a visible presence arrives, since Stoat skips online after Invisible', () => {
    const s = store();
    s.upsertUsers([{ ...lotta, online: false, presence: 'Invisible' }]);
    apply(s, { type: 'UserUpdate', id: 'LOTTA', data: { status: { presence: 'Online' } } });
    expect(s.users.get('LOTTA')).toMatchObject({ online: true, presence: 'Online' });
    apply(s, { type: 'UserUpdate', id: 'LOTTA', data: { status: { presence: 'Invisible' } } });
    expect(s.users.get('LOTTA')!.presence).toBe('Invisible');
  });

  it('applies to your own user too', () => {
    const s = store();
    apply(s, { type: 'UserUpdate', id: 'ME', data: { status: { presence: 'Busy' } } });
    expect(s.self!.presence).toBe('Busy');
  });
});

describe('profile changes', () => {
  const kinds = (f: Frame) => mapFrames(f).map((e) => e.type);

  it('reads empty data, or a cleared bio or banner, as a profile change', () => {
    expect(kinds({ type: 'UserUpdate', id: 'LOTTA', data: {} })).toEqual(['userUpdate', 'profileChanged']);
    expect(kinds({ type: 'UserUpdate', id: 'LOTTA', data: {}, clear: ['ProfileContent', 'ProfileBackground', 'Avatar'] })).toEqual(['userUpdate', 'profileChanged']);
    expect(kinds({ type: 'UserUpdate', id: 'LOTTA', data: { status: { presence: 'Idle' } } })).toEqual(['userUpdate']);
    expect(kinds({ type: 'UserUpdate', id: 'LOTTA', data: {}, clear: ['Avatar'] })).toEqual(['userUpdate']);
  });
});

describe('UserRelationship', () => {
  it('replaces presence and status: a block arrives without them', () => {
    const s = store();
    apply(s, { type: 'UserRelationship', id: 'ME', user: { _id: 'LOTTA', username: 'lotta', discriminator: '1234', relationship: 'Blocked', online: false } });
    const u = s.users.get('LOTTA')!;
    expect(u.relationship).toBe('Blocked');
    expect(u.online).toBe(false);
    expect(u.presence).toBeUndefined();
    expect(u.statusText).toBeUndefined();
  });

  it('adds a user it hasn\'t seen, with what the event carries', () => {
    const s = store();
    apply(s, { type: 'UserRelationship', id: 'ME', user: { _id: 'NEW', username: 'uusi', discriminator: '7701', relationship: 'Incoming', online: true, status: { presence: 'Idle' } } });
    expect(s.users.get('NEW')).toMatchObject({ relationship: 'Incoming', online: true, presence: 'Idle' });
  });
});

describe('UserSettingsUpdate', () => {
  it('maps to a settings event with each key\'s value', () => {
    const [e] = mapFrames({ type: 'UserSettingsUpdate', id: 'ME', update: { 'concord:probe': [1791922628734, 'v0'] } });
    expect(e).toEqual({ type: 'settings', values: { 'concord:probe': { updated: 1791922628734, value: 'v0' } } });
  });
});

describe('DMs and groups', () => {
  const dm = { kind: 'dm' as const, id: 'DM', recipients: ['ME', 'LOTTA'], active: false, lastMessageId: '01M4VF0000000000000000000A' };
  const group = { kind: 'group' as const, id: 'G', name: 'Sauna', owner: 'ME', recipients: ['ME', 'LOTTA'] };

  it('shows a DM despite Stoat\'s shared active flag, and hides it only when closed here with nothing newer', () => {
    const s = store();
    s.channels.set('DM', dm);
    expect(s.dmList().map((c) => c.id)).toEqual(['DM']);
    s.closedDms = { DM: dm.lastMessageId };
    expect(s.dmList()).toEqual([]);
    apply(s, { type: 'Message', _id: '01M4VF0000000000000000000B', channel: 'DM', author: 'LOTTA', content: 'moi' });
    expect(s.dmList().map((c) => c.id)).toEqual(['DM']);
  });

  it('takes a new owner from the system message, which is all Stoat sends when an owner leaves', () => {
    const s = store();
    s.channels.set('G', group);
    apply(s, { type: 'Message', _id: '01M4VF0000000000000000000C', channel: 'G', author: '00000000000000000000000000', system: { type: 'channel_ownership_changed', from: 'ME', to: 'LOTTA' } });
    expect(s.channels.get('G')).toMatchObject({ owner: 'LOTTA' });
  });

  it('forgets a group this account leaves, with its unread state', () => {
    const s = store();
    s.channels.set('G', group);
    s.unreads.set('G', { channel: 'G', mentions: ['X'] });
    apply(s, { type: 'ChannelGroupLeave', id: 'G', user: 'ME' });
    expect(s.channels.has('G')).toBe(false);
    expect(s.unreads.has('G')).toBe(false);
  });
});
