/** Member actions shared by the people menu and moderation view. */
import { Permission, canActOnMember, canActOnRole, has, memberKey, nextRoles, rolesByRank, serverPermissions, type Id, type Session } from '@concord/domain';
import type { MenuItem, MenuSubItem } from '@concord/ui';
import { m } from '$lib/i18n/index.ts';
import { myRank, serverPerms } from '$lib/view/admin.ts';
import { toasts } from '$lib/view/toast.svelte.ts';
import { adminDialogs } from './dialogs.svelte.ts';
import { moderationView } from './moderation.svelte.ts';
import { shell } from '$lib/view/shell.svelte.ts';

/** Roles this account may give or take away in a server: those below its own. */
export function assignable(session: Session, server: Id) {
  const s = session.store.servers.get(server);
  const rank = myRank(session.store, server);
  return s ? rolesByRank(s).filter((r) => canActOnRole(rank, r)) : [];
}

type RoleQueue = { desired: Map<Id, boolean>; tail: Promise<void>; generation: number };
const roleQueues = new Map<string, RoleQueue>();

function mayManageTarget(session: Session, server: Id, user: Id): boolean {
  const { store } = session;
  const s = store.servers.get(server);
  const self = store.selfId;
  if (!s || !self || !store.members.has(memberKey(server, user))) return false;
  if (user === self) return s.owner === self;
  return canActOnMember(s, self, myRank(store, server), user, store.members.get(memberKey(server, user)));
}

/** Live Roles submenu. Each checkbox writes a rank-checked role list and leaves the submenu open. */
export function roleItem(session: Session, server: Id, user: Id): MenuItem | null {
  const { store } = session;
  const s = store.servers.get(server);
  const self = store.selfId;
  if (!s || !self || !store.members.has(memberKey(server, user))) return null;
  const mine = serverPerms(store, server);
  if (!has(mine, Permission.AssignRoles) || !mayManageTarget(session, server, user)) return null;
  const roles = assignable(session, server);
  if (!roles.length) return null;
  const member = store.members.get(memberKey(server, user));
  return {
    kind: 'submenu', label: m.people.roles,
    items: roles.map((role) => ({
      kind: 'check' as const,
      label: role.name,
      checked: member?.roles.includes(role.id) ?? false,
      stay: true,
      onselect: () => toggleRole(session, server, user, role.id),
    })),
  };
}

function toggleRole(session: Session, server: Id, user: Id, role: Id): Promise<void> {
  const { store } = session;
  const s = store.servers.get(server);
  const self = store.selfId;
  const member = store.members.get(memberKey(server, user));
  const denied = () => {
    toasts.show(m.people.rolesFailed);
    return Promise.reject(new Error(m.people.rolesFailed));
  };
  if (!s || !self || !member || !has(serverPerms(store, server), Permission.AssignRoles) || !mayManageTarget(session, server, user)) return denied();
  const rank = myRank(store, server);
  const assignableRole = s.roles[role];
  if (!assignableRole || !canActOnRole(rank, assignableRole)) return denied();
  const key = `${server}:${user}`;
  let queue = roleQueues.get(key);
  if (!queue) {
    queue = { desired: new Map(), tail: Promise.resolve(), generation: 0 };
    roleQueues.set(key, queue);
  }
  const currentlyDesired = queue.desired.get(role) ?? member.roles.includes(role);
  const wanted = !currentlyDesired;
  queue.desired.set(role, wanted);
  const generation = ++queue.generation;
  const operation = queue.tail.then(async () => {
    const latestServer = store.servers.get(server);
    const latestMember = store.members.get(memberKey(server, user));
    if (!latestServer || !latestMember || !has(serverPerms(store, server), Permission.AssignRoles) || !mayManageTarget(session, server, user)) {
      throw new Error('Role assignment is no longer allowed.');
    }
    const latestRank = myRank(store, server);
    const latestRole = latestServer.roles[role];
    if (!latestRole || !canActOnRole(latestRank, latestRole)) throw new Error('Role rank changed.');
    const selected = new Set(latestMember.roles.filter((id) => latestServer.roles[id] && canActOnRole(latestRank, latestServer.roles[id]!)));
    if (wanted) selected.add(role);
    else selected.delete(role);
    const updatedRoles = nextRoles(latestServer, latestRank, latestMember.roles, [...selected]);
    await session.admin.setMemberRoles(server, user, updatedRoles);
    // The gateway echo can trail the HTTP response. Keep the next rapid click based on the accepted role list.
    const after = store.members.get(memberKey(server, user));
    if (after) store.apply({ type: 'memberUpdate', server, user, data: { roles: updatedRoles }, clear: [] });
  });
  queue.tail = operation.catch(() => {});
  void queue.tail.finally(() => {
    if (roleQueues.get(key) === queue && queue!.generation === generation) roleQueues.delete(key);
  });
  return operation.catch((error: unknown) => {
    toasts.show(m.people.rolesFailed);
    throw error;
  });
}

/** Change your own nickname with Change nickname, or another lower-ranked member's with Manage nicknames. */
export function nicknameItem(session: Session, server: Id, user: Id): MenuItem | null {
  const { store } = session;
  const self = store.selfId;
  if (!self || !store.servers.has(server) || !store.members.has(memberKey(server, user))) return null;
  const mine = serverPerms(store, server);
  const own = user === self;
  const permitted = own ? has(mine, Permission.ChangeNickname) : has(mine, Permission.ManageNicknames) && mayManageTarget(session, server, user);
  if (!permitted) return null;
  return {
    label: m.admin.member.nickname,
    onselect: () => adminDialogs.open({ kind: 'nickname', server, user }),
  };
}

/** Remove another lower-ranked member's server avatar, with Remove avatars, when they have one. */
export function removeAvatarItem(session: Session, server: Id, user: Id): MenuItem | null {
  const { store } = session;
  if (user === store.selfId || !store.members.get(memberKey(server, user))?.avatar) return null;
  if (!has(serverPerms(store, server), Permission.RemoveAvatars) || !mayManageTarget(session, server, user)) return null;
  return {
    label: m.admin.member.removeAvatar,
    onselect: () => void session.admin.editMember(server, user, { remove: ['Avatar'] }).catch(() => toasts.show(m.admin.member.removeAvatarFailed)),
  };
}

/** Discord's timeout lengths, in seconds (m4.7-plan.md decision 8). */
export const TIMEOUTS = [60, 5 * 60, 10 * 60, 60 * 60, 24 * 60 * 60, 7 * 24 * 60 * 60] as const;

/** The member's timeout end while it lasts. */
export function timeoutEnd(session: Session, server: Id, user: Id): Date | null {
  const t = session.store.members.get(memberKey(server, user))?.timeout;
  return t && Date.parse(t) > Date.now() ? new Date(t) : null;
}

/**
 * Time out › with each length, then Remove timeout while one runs. Only over someone below you, and never someone who
 * holds Time out members, whom Stoat refuses with IsElevated, the owner included (m4.7-results.md task 1).
 */
export function timeoutItem(session: Session, server: Id, user: Id, reason: () => string | undefined = () => undefined): MenuItem | null {
  const { store } = session;
  const s = store.servers.get(server);
  const member = store.members.get(memberKey(server, user));
  const target = store.users.get(user);
  if (!s || !member || !target || !has(serverPerms(store, server), Permission.TimeoutMembers) || !mayManageTarget(session, server, user)) return null;
  // Their permissions as if any timeout of their own had ended, since a timeout would hide the one that matters.
  if (has(serverPermissions(s, member, { self: target, now: new Date(8.64e15) }), Permission.TimeoutMembers)) return null;
  const items: MenuSubItem[] = TIMEOUTS.map((seconds) => ({
    label: m.moderation.timeoutFor(seconds),
    onselect: () => adminDialogs.open({ kind: 'timeout', server, user, seconds }),
  }));
  if (timeoutEnd(session, server, user)) {
    items.push('separator', {
      label: m.moderation.removeTimeout,
      onselect: () => void session.admin.editMember(server, user, { remove: ['Timeout'] }, reason()).catch(() => toasts.show(m.moderation.timeoutFailed)),
    });
  }
  return { kind: 'submenu', label: m.moderation.timeOut, items };
}

/** Open the moderation panel for members when this account has at least one moderation permission. */
export function moderationPanelItem(session: Session, server: Id, user: Id): MenuItem | null {
  const { store } = session;
  if (!store.servers.has(server) || !store.members.has(memberKey(server, user))) return null;
  const mine = serverPerms(store, server);
  const permissions = [
    Permission.KickMembers, Permission.BanMembers, Permission.TimeoutMembers, Permission.AssignRoles,
    Permission.ManageNicknames, Permission.RemoveAvatars, Permission.MuteMembers, Permission.DeafenMembers,
    Permission.MoveMembers, Permission.ManageMessages, Permission.ViewAuditLogs,
  ];
  if (!permissions.some((permission) => has(mine, permission))) return null;
  return { label: m.people.moderationView, onselect: () => { moderationView.open(server, user); shell.panelOpen = true; } };
}

/** Kick and ban actions, offered only for a target below this account. Their dialogs ask for the reason. */
export function kickBanItems(session: Session, server: Id, user: Id): MenuItem[] {
  const { store } = session;
  const s = store.servers.get(server);
  const self = store.selfId;
  if (!s || !self || !store.members.has(memberKey(server, user))) return [];
  const below = canActOnMember(s, self, myRank(store, server), user, store.members.get(memberKey(server, user)));
  const mine = serverPerms(store, server);
  const items: MenuItem[] = [];
  if (below && has(mine, Permission.KickMembers)) items.push({ label: m.admin.kick.item, danger: true, onselect: () => adminDialogs.open({ kind: 'kick', server, user }) });
  if (below && has(mine, Permission.BanMembers)) items.push({ label: m.admin.ban.item, danger: true, onselect: () => adminDialogs.open({ kind: 'ban', server, user }) });
  return items;
}

/** The moderation section in menu order: panel first, then kick and ban. */
export function moderationItems(session: Session, server: Id, user: Id): MenuItem[] {
  const panel = moderationPanelItem(session, server, user);
  return [...(panel ? [panel] : []), ...kickBanItems(session, server, user)];
}

/** Compatibility helper for settings screens that still expect the old flat administration list. */
export function memberItems(session: Session, server: Id, user: Id): MenuItem[] {
  const roles = roleItem(session, server, user);
  return [...(roles ? [roles] : []), ...kickBanItems(session, server, user)];
}
