/** Member administration for the people menu, when it opens in a server (m2c-plan.md): roles, kicks and bans. */
import { Permission, canActOnMember, canActOnRole, has, memberKey, rolesByRank, type Id, type Session } from '@concord/domain';
import type { MenuItem } from '@concord/ui';
import { m } from '$lib/i18n/index.ts';
import { myRank, serverPerms } from '$lib/view/admin.ts';
import { adminDialogs } from './dialogs.svelte.ts';

/** Roles this account may give or take away in a server: those below its own. */
export function assignable(session: Session, server: Id) {
  const s = session.store.servers.get(server);
  const rank = myRank(session.store, server);
  return s ? rolesByRank(s).filter((r) => canActOnRole(rank, r)) : [];
}

export function memberItems(session: Session, server: Id, user: Id): MenuItem[] {
  const store = session.store;
  const s = store.servers.get(server);
  const self = store.selfId;
  if (!s || !self || !store.members.has(memberKey(server, user))) return [];
  const mine = serverPerms(store, server);
  const items: MenuItem[] = [];
  const below = canActOnMember(s, self, myRank(store, server), user, store.members.get(memberKey(server, user)));
  if (has(mine, Permission.AssignRoles) && assignable(session, server).length && (user === self ? s.owner === self : below)) {
    items.push({ label: m.admin.roles.memberRoles, onselect: () => adminDialogs.open({ kind: 'memberRoles', server, user }) });
  }
  if (below && has(mine, Permission.KickMembers)) items.push({ label: m.admin.kick.item, danger: true, onselect: () => adminDialogs.open({ kind: 'kick', server, user }) });
  if (below && has(mine, Permission.BanMembers)) items.push({ label: m.admin.ban.item, danger: true, onselect: () => adminDialogs.open({ kind: 'ban', server, user }) });
  return items;
}
