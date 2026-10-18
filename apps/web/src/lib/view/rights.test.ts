/** What a missing permission takes away, as the call, composer and role editor read it (m4.7-plan.md task 5). */
import { Permission as P, Store, type Member, type Role, type TextChannel, type User } from '@concord/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DANGEROUS_BITS, SUGGESTED_ROLES, groupsFor, newlyDangerous } from '$lib/admin/permissions.ts';
import { suggest } from '$lib/composer/suggest.ts';
import { callRights, permissionsIn, sendBlock } from './channels.ts';

const user = (id: string): User => ({ id, username: id, discriminator: '0001', badges: 0, flags: 0, online: true, relationship: 'None' });
const channel = (id: string, extra: Partial<TextChannel> = {}): TextChannel => ({ kind: 'text', id, server: 'S', name: id, rolePermissions: {}, nsfw: false, ...extra });
const BASE = P.ViewChannel | P.ReadMessageHistory | P.SendMessage | P.UploadFiles | P.React | P.Connect | P.Speak | P.Video | P.Listen;

function world(defaults: bigint, me: Partial<Member> = {}, roles: Record<string, Role> = {}): Store {
  const store = new Store();
  store.self = user('ME');
  store.upsertUsers([user('ME'), user('OWNER')]);
  store.servers.set('S', { id: 'S', owner: 'OWNER', name: 'S', channels: ['T', 'V'], categories: [], roles, defaultPermissions: defaults });
  store.channels.set('T', channel('T'));
  store.channels.set('V', channel('V', { voice: {} }));
  store.upsertMembers([{ server: 'S', user: 'ME', joinedAt: '', roles: Object.keys(roles), canPublish: true, canReceive: true, ...me }]);
  return store;
}

afterEach(() => vi.useRealTimers());

describe('callRights', () => {
  it('reads each permission in the channel', () => {
    const rights = (defaults: bigint) => { const store = world(defaults); return callRights(store, store.channels.get('V')); };
    expect(rights(BASE & ~P.Connect)).toEqual({ connect: false, speak: true, video: true, listen: true });
    expect(rights(BASE & ~(P.Speak | P.Video))).toEqual({ connect: true, speak: false, video: false, listen: true });
  });

  it('takes Speak and Video away with a server mute, and Listen with a server deafen', () => {
    const store = world(BASE, { canPublish: false, canReceive: false });
    expect(callRights(store, store.channels.get('V'))).toEqual({ connect: true, speak: false, video: false, listen: false });
  });

  it('allows everything outside a channel', () => {
    expect(callRights(world(0n), undefined)).toEqual({ connect: true, speak: true, video: true, listen: true });
  });
});

describe('a timeout running out', () => {
  it('gives back sending, uploads and reactions together, at its end', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-17T12:00:00Z'));
    const store = world(BASE, { timeout: '2026-10-17T12:01:00Z' });
    const t = store.channels.get('T')!;
    expect(sendBlock(store, t)).toBe('timeout');
    expect(permissionsIn(store, t) & (P.UploadFiles | P.React)).toBe(0n);
    vi.advanceTimersByTime(61_000);
    expect(sendBlock(store, t)).toBeNull();
    expect(permissionsIn(store, t) & (P.UploadFiles | P.React)).toBe(P.UploadFiles | P.React);
  });
});

describe('mass mentions', () => {
  const names = (store: Store, everyone: boolean) =>
    suggest(store, store.channels.get('T')!, '@', 'ev', { mentionRoles: false, mentionEveryone: everyone, unicode: [] }).map((s) => s.label);

  it('are suggested only with Mention everyone', () => {
    const store = world(BASE);
    expect(names(store, true)).toContain('@everyone');
    expect(names(store, false)).not.toContain('@everyone');
  });
});

describe('the role editor', () => {
  const keys = (context: Parameters<typeof groupsFor>[0]) => groupsFor(context).flatMap((g) => g.keys);

  it('has View audit log among the server permissions only', () => {
    expect(keys('server')).toContain('ViewAuditLogs');
    expect(keys('voice')).not.toContain('ViewAuditLogs');
  });

  it('lists voice permissions for a voice channel and not a text channel', () => {
    expect(keys('voice')).toEqual(expect.arrayContaining(['Connect', 'Speak', 'MoveMembers', 'SendMessage']));
    expect(keys('text')).not.toContain('Connect');
    expect(keys('text')).toContain('SendMessage');
  });

  it('names only the dangerous permissions a change adds', () => {
    expect(newlyDangerous(P.ManageMessages, P.ManageMessages | P.BanMembers | P.KickMembers)).toEqual(['BanMembers']);
    expect(newlyDangerous(P.BanMembers, 0n)).toEqual([]);
  });

  it('suggests a Moderator who can’t delete channels or ban, and an Admin with everything dangerous', () => {
    expect(SUGGESTED_ROLES.moderator & (P.ManageChannel | P.BanMembers | P.ManageServer)).toBe(0n);
    expect(SUGGESTED_ROLES.moderator & P.ManageMessages).toBe(P.ManageMessages);
    expect(SUGGESTED_ROLES.admin & DANGEROUS_BITS).toBe(DANGEROUS_BITS);
  });
});
