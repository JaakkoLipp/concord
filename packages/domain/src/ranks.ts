/**
 * Who may act on which roles and members in a server, as Stoat 0.15.5 decides it (m2c-plan.md, checked
 * live and in crates/delta/src/routes/servers). Lower ranks are stronger. The UI offers only what these allow.
 */
import type { Id, Member, Override, Role, Server } from './entities.ts';

/** A rank for whoever holds no role, and for anyone who isn't a member: weaker than every role. */
export const NO_RANK = Number.POSITIVE_INFINITY;

/** The owner outranks everyone. Anyone else ranks as their strongest role, or NO_RANK with none. */
export function memberRank(server: Server, user: Id, member: Member | undefined): number {
  if (server.owner === user) return Number.NEGATIVE_INFINITY;
  let best = NO_RANK;
  for (const id of member?.roles ?? []) {
    const r = server.roles[id];
    if (r && r.rank < best) best = r.rank;
  }
  return best;
}

/** A role you may edit, delete, give, take away or set overrides for: strictly below your own rank. */
export const canActOnRole = (myRank: number, role: Role) => role.rank > myRank;

/** A member you may kick, ban or give roles to: not yourself, not the owner, and ranked strictly below you. */
export function canActOnMember(server: Server, self: Id, myRank: number, target: Id, member: Member | undefined): boolean {
  if (target === self || target === server.owner) return false;
  return memberRank(server, target, member) > myRank;
}

/** Roles sorted strongest first, as rank ties are broken by ID. */
export function rolesByRank(server: Server): Role[] {
  return Object.values(server.roles).sort((a, b) => a.rank - b.rank || (a.id < b.id ? -1 : 1));
}

/**
 * The full role list to send when you change a member's roles: what you chose among the roles you may
 * assign, plus every role they hold that you may not touch, since Stoat replaces the whole list.
 */
export function nextRoles(server: Server, myRank: number, held: Id[], chosen: Id[]): Id[] {
  const mine = (id: Id) => !!server.roles[id] && canActOnRole(myRank, server.roles[id]!);
  return [...held.filter((id) => !mine(id) && server.roles[id]), ...chosen.filter(mine)];
}

/**
 * An override you may write: every permission it newly allows, or stops denying, is one you hold. Adding a
 * deny needs nothing. The owner holds every permission.
 */
export function canWriteOverride(mine: bigint, before: Override, after: Override): boolean {
  const granted = (after.allow & ~before.allow) | (before.deny & ~after.deny);
  return (granted & ~mine) === 0n;
}

/**
 * Move one role up (-1) or down (+1) in the rank order. Roles at or above your rank keep their places, so a
 * move into them returns null.
 */
export function moveRole(order: Id[], roles: Record<Id, Role>, myRank: number, role: Id, delta: -1 | 1): Id[] | null {
  const i = order.indexOf(role);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= order.length) return null;
  const a = roles[order[i]!];
  const b = roles[order[j]!];
  if (!a || !b || !canActOnRole(myRank, a) || !canActOnRole(myRank, b)) return null;
  const next = [...order];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

/**
 * A rank order to send, after waiting: the wanted order for roles that still exist, then roles created
 * meanwhile in their current order. Stoat needs every role exactly once.
 */
export function mergeOrder(wanted: Id[], server: Server): Id[] {
  const current = rolesByRank(server).map((r) => r.id);
  const kept = wanted.filter((id) => server.roles[id]);
  return [...kept, ...current.filter((id) => !kept.includes(id))];
}
