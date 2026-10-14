/** The server menu (m2c-plan.md, "Entry points"), from the sidebar header and a right-click on the rail icon. */
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import type { Id, Session } from '@concord/domain';
import type { MenuItem } from '@concord/ui';
import { m } from '$lib/i18n/index.ts';
import { isOwner, serverSections } from '$lib/view/admin.ts';
import { confirm } from '$lib/view/confirm.svelte.ts';
import { toasts } from '$lib/view/toast.svelte.ts';

export function openServerSettings(server: Id, section: string): Promise<void> {
  return goto(resolve('/(app)/app/server-settings/[server]/[section]', { server, section }));
}

export async function leaveServer(session: Session, server: Id): Promise<void> {
  const name = session.store.servers.get(server)?.name ?? '';
  if (!(await confirm.ask({ title: m.admin.leaveTitle(name), body: m.admin.leaveBody, confirm: m.admin.leaveServer, danger: true }))) return;
  try {
    await session.admin.leaveServer(server);
    await goto(resolve('/app/channels/@me'));
  } catch {
    toasts.show(m.admin.leaveFailed);
  }
}

export function serverMenu(session: Session, server: Id): MenuItem[] {
  const store = session.store;
  const items: MenuItem[] = [];
  const sections = serverSections(store, server);
  if (sections.length) items.push({ label: m.admin.serverSettings, onselect: () => void openServerSettings(server, sections[0]!) });
  if (!isOwner(store, server)) {
    if (items.length) items.push('separator');
    items.push({ label: m.admin.leaveServer, danger: true, onselect: () => void leaveServer(session, server) });
  }
  return items;
}
