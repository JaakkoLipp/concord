import { describe, expect, it } from 'vitest';
import type { Member, Server, TextChannel, User } from './entities.ts';
import { DEFAULT_DIRECT_MESSAGE, GRANT_ALL_SAFE, Permission as P, VIEW_ONLY, channelPermissions, has, serverPermissions } from './permissions.ts';

const user = (id: string, bot = false): User => ({
  id, username: id, discriminator: '0001', badges: 0, flags: 0, online: true, relationship: 'None', ...(bot ? { bot: { owner: 'x' } } : {}),
});
// The seeded server's default permissions, with InviteOthers already removed.
const DEFAULTS = 76981212160n;
const server: Server = {
  id: 'S', owner: 'owner', name: 'Concord', channels: ['C'], categories: [], defaultPermissions: DEFAULTS,
  roles: {
    admin: { id: 'admin', name: 'Admin', hoist: true, rank: 0, permissions: { allow: P.InviteOthers, deny: 0n } },
    mod: { id: 'mod', name: 'Moderaattori', hoist: true, rank: 1, permissions: { allow: P.ManageMessages | P.KickMembers, deny: 0n } },
    muted: { id: 'muted', name: 'Hiljennetty', hoist: false, rank: 5, permissions: { allow: 0n, deny: P.SendMessage | P.ManageMessages } },
  },
};
const member = (user: string, roles: string[] = [], extra: Partial<Member> = {}): Member => ({
  server: 'S', user, joinedAt: '2026-01-05T09:00:00Z', roles, canPublish: true, canReceive: true, ...extra,
});
const text = (extra: Partial<TextChannel> = {}): TextChannel => ({ kind: 'text', id: 'C', server: 'S', name: 'yleinen', rolePermissions: {}, nsfw: false, ...extra });

describe('server permissions', () => {
  it('give the owner every safe permission', () => {
    expect(serverPermissions(server, member('owner'), { self: user('owner') })).toBe(GRANT_ALL_SAFE);
  });
  it('give a plain member the default permissions, without InviteOthers', () => {
    const v = serverPermissions(server, member('a'), { self: user('a') });
    expect(v).toBe(DEFAULTS);
    expect(has(v, P.InviteOthers)).toBe(false);
    expect(has(v, P.SendMessage)).toBe(true);
  });
  it('give nothing to a non-member', () => {
    expect(serverPermissions(server, undefined, { self: user('a') })).toBe(0n);
  });
  it('let the more important role win', () => {
    // mod (rank 1) allows ManageMessages; muted (rank 5) denies it. Rank 1 applies last and wins.
    const v = serverPermissions(server, member('a', ['muted', 'mod']), { self: user('a') });
    expect(has(v, P.ManageMessages)).toBe(true);
    expect(has(v, P.SendMessage)).toBe(false);
  });
  it('restrict a timed-out member to viewing', () => {
    const v = serverPermissions(server, member('a', ['admin'], { timeout: '2099-01-01T00:00:00Z' }), { self: user('a') });
    expect(v).toBe(VIEW_ONLY & DEFAULTS);
  });
  it('remove speaking and listening when the member may not publish or receive', () => {
    const v = serverPermissions(server, member('a', [], { canPublish: false, canReceive: false }), { self: user('a') });
    expect(has(v, P.Speak) || has(v, P.Video) || has(v, P.Listen)).toBe(false);
    expect(has(v, P.Connect)).toBe(true);
  });
});

describe('channel permissions', () => {
  const ctx = (id: string, roles: string[] = []) => ({ self: user(id), server, member: member(id, roles) });
  it('make a read-only channel readable but not writable, except for moderators', () => {
    const readOnly = text({ defaultPermissions: { allow: 0n, deny: P.SendMessage }, rolePermissions: { mod: { allow: P.SendMessage, deny: 0n } } });
    expect(has(channelPermissions(readOnly, ctx('a')), P.SendMessage)).toBe(false);
    expect(has(channelPermissions(readOnly, ctx('a')), P.ReadMessageHistory)).toBe(true);
    expect(has(channelPermissions(readOnly, ctx('m', ['mod'])), P.SendMessage)).toBe(true);
  });
  it('hide a channel completely when ViewChannel is denied', () => {
    const hidden = text({ defaultPermissions: { allow: 0n, deny: P.ViewChannel } });
    expect(channelPermissions(hidden, ctx('a'))).toBe(0n);
    expect(channelPermissions(hidden, ctx('owner'))).toBe(GRANT_ALL_SAFE);
  });
  it('apply channel role overrides after server roles', () => {
    const c = text({ rolePermissions: { muted: { allow: P.SendMessage, deny: 0n } } });
    expect(has(channelPermissions(c, ctx('a', ['muted'])), P.SendMessage)).toBe(true);
  });
  it('let friends write in a DM and make other DMs read-only', () => {
    const dm = { kind: 'dm' as const, id: 'D', recipients: ['a', 'b'], active: true };
    const friend = channelPermissions(dm, { self: user('a'), relationship: () => 'Friend' });
    const stranger = channelPermissions(dm, { self: user('a'), relationship: () => 'None', mutual: () => true });
    expect(friend).toBe(DEFAULT_DIRECT_MESSAGE);
    expect(stranger).toBe(VIEW_ONLY);
    expect(channelPermissions(dm, { self: user('c') })).toBe(0n);
  });
  it('give a group owner everything and members the group defaults', () => {
    const group = { kind: 'group' as const, id: 'G', name: 'Sauna', owner: 'a', recipients: ['a', 'b'] };
    expect(channelPermissions(group, { self: user('a') })).toBe(GRANT_ALL_SAFE);
    expect(channelPermissions(group, { self: user('b') })).toBe(VIEW_ONLY | DEFAULT_DIRECT_MESSAGE);
  });
});
