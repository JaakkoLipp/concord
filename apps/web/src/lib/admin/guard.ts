/**
 * Guardrails in the role and channel editors (m4.7-plan.md task 11): granting a dangerous permission to a role asks first,
 * naming how many members get it. These rules bind Concord's editor only; Stoat lets anyone with Manage permissions grant
 * what they hold.
 */
import type { Id, Session } from '@concord/domain';
import { m } from '$lib/i18n/index.ts';
import { confirm } from '$lib/view/confirm.svelte.ts';
import { newlyDangerous } from './permissions.ts';

/** Members of a server holding a role. */
export function holders(session: Session, server: Id, role: Id): number {
  let n = 0;
  for (const mem of session.store.members.values()) if (mem.server === server && mem.roles.includes(role)) n++;
  return n;
}

/** Whether a change to a role's allowed permissions may go ahead: at once, or once confirmed when it adds a dangerous one. */
export async function confirmGrant(session: Session, server: Id, role: Id, before: bigint, after: bigint): Promise<boolean> {
  const added = newlyDangerous(before, after);
  if (!added.length) return true;
  const name = session.store.servers.get(server)?.roles[role]?.name ?? '';
  const permissions = added.map((k) => m.admin.permissionNames[k][0]).join(', ');
  const dangers = added.map((k) => m.admin.roles.dangers[k as keyof typeof m.admin.roles.dangers]).join(' ');
  return confirm.ask({
    title: m.admin.roles.grantTitle(permissions, name), body: m.admin.roles.grantBody(holders(session, server, role), dangers),
    confirm: m.admin.roles.grant, danger: true,
  });
}
