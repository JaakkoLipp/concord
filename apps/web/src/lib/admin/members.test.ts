/** Who may be timed out, and the server admin rule (m4.7-plan.md task 6, rules from m4.7-results.md task 1). */
import { Permission as P, Store, type Member, type Role, type Session, type User } from '@concord/domain';
import { describe, expect, it } from 'vitest';
import { isServerAdmin } from '$lib/view/admin.ts';
import { timeoutItem } from './members.ts';

const user = (id: string): User => ({ id, username: id, discriminator: '0001', badges: 0, flags: 0, online: true, relationship: 'None' });
const role = (id: string, rank: number, allow: bigint): Role => ({ id, name: id, hoist: false, rank, permissions: { allow, deny: 0n } });
const member = (u: string, roles: string[] = [], extra: Partial<Member> = {}): Member => ({ server: 'S', user: u, joinedAt: '', roles, canPublish: true, canReceive: true, ...extra });

function world(mine: bigint, self = 'MOD'): Session {
  const store = new Store();
  store.self = user(self);
  store.upsertUsers(['OWNER', 'MOD', 'PEER', 'AINO', 'TIMER'].map(user));
  store.servers.set('S', {
    id: 'S', owner: 'OWNER', name: 'S', channels: [], categories: [], defaultPermissions: P.ViewChannel,
    roles: { mod: role('mod', 1, mine), timer: role('timer', 2, P.TimeoutMembers) },
  });
  store.upsertMembers([member('OWNER'), member('MOD', ['mod']), member('PEER', ['mod']), member('AINO'), member('TIMER', ['timer'])]);
  return { store } as unknown as Session;
}

describe('timeoutItem', () => {
  it('offers the lengths over someone below, without Remove timeout until one runs', () => {
    const item = timeoutItem(world(P.TimeoutMembers), 'S', 'AINO');
    expect(item && typeof item === 'object' && 'items' in item ? item.items.length : 0).toBe(6);
  });

  it('adds Remove timeout while one runs', () => {
    const session = world(P.TimeoutMembers);
    session.store.upsertMembers([member('AINO', [], { timeout: new Date(Date.now() + 60_000).toISOString() })]);
    const item = timeoutItem(session, 'S', 'AINO');
    expect(item && typeof item === 'object' && 'items' in item ? item.items.length : 0).toBe(8);
  });

  it('is not offered without the permission, over the owner, a peer, or someone who may time out others', () => {
    expect(timeoutItem(world(P.KickMembers), 'S', 'AINO')).toBeNull();
    expect(timeoutItem(world(P.TimeoutMembers), 'S', 'OWNER')).toBeNull();
    expect(timeoutItem(world(P.TimeoutMembers), 'S', 'PEER')).toBeNull();
    // Ranked below the Moderator, but Stoat refuses anyone holding Time out members with IsElevated.
    expect(timeoutItem(world(P.TimeoutMembers), 'S', 'TIMER')).toBeNull();
  });

  it('still sees that permission on someone timed out themself', () => {
    const session = world(P.TimeoutMembers);
    session.store.upsertMembers([member('TIMER', ['timer'], { timeout: new Date(Date.now() + 60_000).toISOString() })]);
    expect(timeoutItem(session, 'S', 'TIMER')).toBeNull();
  });
});

describe('isServerAdmin', () => {
  it('is the owner, or both Manage server and Manage messages', () => {
    expect(isServerAdmin(world(0n, 'OWNER').store, 'S')).toBe(true);
    expect(isServerAdmin(world(P.ManageServer | P.ManageMessages).store, 'S')).toBe(true);
    expect(isServerAdmin(world(P.ManageMessages).store, 'S')).toBe(false);
    expect(isServerAdmin(world(P.ManageServer).store, 'S')).toBe(false);
  });
});
