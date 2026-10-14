/** The rank and grant rules (m2c-plan.md task 1), with the cases the probes showed on Stoat 0.15.5. */
import { describe, expect, it } from 'vitest';
import type { Member, Role, Server } from './entities.ts';
import { Permission as P } from './permissions.ts';
import { canActOnMember, canActOnRole, canWriteOverride, memberRank, mergeOrder, moveRole, nextRoles } from './ranks.ts';

const role = (id: string, rank: number): Role => ({ id, name: id, hoist: false, rank, permissions: { allow: 0n, deny: 0n } });
const server: Server = {
  id: 's', owner: 'owner', name: 'S', channels: [], categories: [], defaultPermissions: 0n,
  roles: { admin: role('admin', 0), mod: role('mod', 1), member: role('member', 2) },
};
const member = (user: string, roles: string[]): Member => ({ server: 's', user, joinedAt: '', roles, canPublish: true, canReceive: true });

describe('ranks', () => {
  it('ranks the owner above everyone and a member by their strongest role', () => {
    expect(memberRank(server, 'owner', undefined)).toBe(-Infinity);
    expect(memberRank(server, 'onni', member('onni', ['member', 'mod']))).toBe(1);
    expect(memberRank(server, 'tuuli', member('tuuli', []))).toBe(Infinity);
    // A role deleted meanwhile doesn't count.
    expect(memberRank(server, 'tuuli', member('tuuli', ['gone']))).toBe(Infinity);
  });

  it('lets a member act only on roles strictly below their own', () => {
    expect(canActOnRole(1, server.roles.mod!)).toBe(false);
    expect(canActOnRole(1, server.roles.admin!)).toBe(false);
    expect(canActOnRole(1, server.roles.member!)).toBe(true);
    // No roles: nothing, even if Everyone were given ManageRole.
    expect(canActOnRole(Infinity, server.roles.member!)).toBe(false);
    expect(canActOnRole(-Infinity, server.roles.admin!)).toBe(true);
  });

  it('never acts on yourself, the owner or an equal', () => {
    const mod = 1;
    expect(canActOnMember(server, 'onni', mod, 'onni', member('onni', ['mod']))).toBe(false);
    expect(canActOnMember(server, 'onni', mod, 'owner', undefined)).toBe(false);
    expect(canActOnMember(server, 'onni', mod, 'aino', member('aino', ['mod']))).toBe(false);
    expect(canActOnMember(server, 'onni', mod, 'tuuli', member('tuuli', ['member']))).toBe(true);
    expect(canActOnMember(server, 'onni', mod, 'tuuli', member('tuuli', []))).toBe(true);
    // Two members with no roles can't act on each other.
    expect(canActOnMember(server, 'onni', Infinity, 'tuuli', member('tuuli', []))).toBe(false);
    expect(canActOnMember(server, 'owner', -Infinity, 'aino', member('aino', ['admin']))).toBe(true);
  });

  it('keeps roles you may not touch when changing a member’s roles', () => {
    // A moderator removes Member from someone who is also Admin: Admin stays.
    expect(nextRoles(server, 1, ['admin', 'member'], [])).toEqual(['admin']);
    expect(nextRoles(server, 1, ['admin'], ['member', 'mod'])).toEqual(['admin', 'member']);
    expect(nextRoles(server, 1, ['gone'], ['member'])).toEqual(['member']);
  });

  it('allows writing an override only with every permission it grants or un-denies', () => {
    const mine = P.SendMessage | P.KickMembers;
    const none = { allow: 0n, deny: 0n };
    expect(canWriteOverride(mine, none, { allow: P.KickMembers, deny: 0n })).toBe(true);
    expect(canWriteOverride(mine, none, { allow: P.MentionEveryone, deny: 0n })).toBe(false);
    // Denying needs nothing; lifting a deny needs the permission.
    expect(canWriteOverride(mine, none, { allow: 0n, deny: P.MentionEveryone })).toBe(true);
    expect(canWriteOverride(mine, { allow: 0n, deny: P.MentionEveryone }, none)).toBe(false);
    // Bits already allowed may stay.
    expect(canWriteOverride(mine, { allow: P.MentionEveryone, deny: 0n }, { allow: P.MentionEveryone | P.SendMessage, deny: 0n })).toBe(true);
  });

  it('moves roles only among those below you', () => {
    const order = ['admin', 'mod', 'member'];
    expect(moveRole(order, server.roles, -Infinity, 'member', -1)).toEqual(['admin', 'member', 'mod']);
    expect(moveRole(order, server.roles, 1, 'member', -1)).toBeNull();
    expect(moveRole(order, server.roles, 0, 'member', -1)).toEqual(['admin', 'member', 'mod']);
    expect(moveRole(order, server.roles, 0, 'mod', -1)).toBeNull();
    expect(moveRole(order, server.roles, -Infinity, 'admin', -1)).toBeNull();
  });

  it('merges a waiting order with roles created or deleted meanwhile', () => {
    const now: Server = { ...server, roles: { admin: role('admin', 0), member: role('member', 1), fresh: role('fresh', 2) } };
    expect(mergeOrder(['member', 'mod', 'admin'], now)).toEqual(['member', 'admin', 'fresh']);
  });
});
