/** What this account may administer in a server, for showing only the controls it can use (m2c-plan.md). */
import { Permission, has, memberKey, memberRank, serverPermissions, type Id, type Store } from '@concord/domain';
import { canView, permissionsIn } from './channels.ts';

/** This account's server-wide permissions. The owner holds every one. */
export function serverPerms(store: Store, server: Id): bigint {
  const s = store.servers.get(server);
  const self = store.self;
  if (!s || !self) return 0n;
  return serverPermissions(s, store.members.get(memberKey(server, self.id)), { self });
}

/** This account's rank in a server: lower is stronger, the owner strongest. */
export function myRank(store: Store, server: Id): number {
  const s = store.servers.get(server);
  const self = store.selfId;
  if (!s || !self) return Number.POSITIVE_INFINITY;
  return memberRank(s, self, store.members.get(memberKey(server, self)));
}

export const isOwner = (store: Store, server: Id) => store.servers.get(server)?.owner === store.selfId;

export type ServerSection = 'overview';
const NEEDS: Record<ServerSection, bigint[]> = {
  overview: [Permission.ManageServer],
};

/** Server settings sections this account may open, in order. Empty means no "Server settings" at all. */
export function serverSections(store: Store, server: Id): ServerSection[] {
  const mine = serverPerms(store, server);
  return (Object.keys(NEEDS) as ServerSection[]).filter((s) => NEEDS[s].some((p) => has(mine, p)));
}

/** Text channels of a server where this account holds a permission, in sidebar order. */
export function channelsWith(store: Store, server: Id, permission: bigint): Id[] {
  return store.channelTree(server).flatMap((g) => g.channels)
    .filter((c) => c.kind === 'text' && canView(store, c) && has(permissionsIn(store, c), permission))
    .map((c) => c.id);
}

/** Whether the account may create servers: only IDs in Stoat's `restrict_server_creation`, when it is set. */
export function canCreateServers(store: Store): boolean {
  const list = store.node?.serverCreators ?? [];
  return !list.length || (!!store.selfId && list.includes(store.selfId));
}
