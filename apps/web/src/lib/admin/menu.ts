/** The server menu (m2c-plan.md, "Entry points"), from the sidebar header and a right-click on the rail icon. */
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { Permission, deleteCategory, has, moveCategory, moveChannel, type Category, type Id, type Session } from '@concord/domain';
import type { MenuItem } from '@concord/ui';
import { m } from '$lib/i18n/index.ts';
import { channelsWith, isOwner, serverPerms, serverSections } from '$lib/view/admin.ts';
import { canView, permissionsIn } from '$lib/view/channels.ts';
import { adminDialogs } from './dialogs.svelte.ts';
import { notifyItems } from '$lib/notify/dialog.svelte.ts';
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

/** Write a category list, telling the user if Stoat refused it. The sidebar is put back by the session. */
function writeCategories(session: Session, server: Id, next: Category[] | null): void {
  if (next) void session.admin.setCategories(server, next).catch(() => toasts.show(m.admin.channelFailed));
}

export const canManageChannels = (session: Session, server: Id) => has(serverPerms(session.store, server), Permission.ManageChannel);

export function serverMenu(session: Session, server: Id): MenuItem[] {
  const store = session.store;
  const items: MenuItem[] = [];
  const sections = serverSections(store, server);
  if (channelsWith(store, server, Permission.InviteOthers).length) items.push({ label: m.admin.invite.people, onselect: () => adminDialogs.open({ kind: 'invite', server, channel: null }) });
  if (sections.length) items.push({ label: m.admin.serverSettings, onselect: () => void openServerSettings(server, sections[0]!) });
  if (canManageChannels(session, server)) {
    items.push({ label: m.admin.createChannel, onselect: () => adminDialogs.open({ kind: 'createChannel', server, category: null }) });
    items.push({ label: m.admin.createCategory, onselect: () => adminDialogs.open({ kind: 'category', server, id: null }) });
  }
  if (items.length) items.push('separator');
  items.push(...notifyItems(session, 'server', server, 'server'));
  if (!isOwner(store, server)) {
    items.push('separator');
    items.push({ label: m.admin.leaveServer, danger: true, onselect: () => void leaveServer(session, server) });
  }
  // First, as on Discord, while anything in the server is unread (m4.5-plan.md task 3).
  const badge = store.serverBadge(server, (c) => canView(store, c));
  if (badge.unread || badge.mentions) {
    items.unshift({ label: m.notify.markRead, onselect: () => void session.markServerRead(server).catch(() => toasts.show(m.notify.markReadFailed)) }, 'separator');
  }
  return items;
}

export function categoryMenu(session: Session, server: Id, category: string): MenuItem[] {
  if (!canManageChannels(session, server)) return [];
  const s = session.store.servers.get(server);
  if (!s) return [];
  const i = s.categories.findIndex((c) => c.id === category);
  const title = s.categories[i]?.title ?? '';
  return [
    { label: m.admin.createChannel, onselect: () => adminDialogs.open({ kind: 'createChannel', server, category }) },
    { label: m.admin.renameCategory, onselect: () => adminDialogs.open({ kind: 'category', server, id: category }) },
    { label: m.admin.moveUp, disabled: i <= 0, onselect: () => writeCategories(session, server, moveCategory(s.categories, category, -1)) },
    { label: m.admin.moveDown, disabled: i < 0 || i >= s.categories.length - 1, onselect: () => writeCategories(session, server, moveCategory(s.categories, category, 1)) },
    'separator',
    {
      label: m.admin.deleteCategory, danger: true,
      onselect: () => void confirm.ask({ title: m.admin.deleteCategoryTitle(title), body: m.admin.deleteCategoryBody, confirm: m.admin.deleteCategory, danger: true })
        .then((ok) => { if (ok) writeCategories(session, server, deleteCategory(session.store.servers.get(server)?.categories ?? [], category)); }),
    },
  ];
}

export function openChannelSettings(channel: Id, section: string): Promise<void> {
  return goto(resolve('/(app)/app/channel-settings/[channel]/[section]', { channel, section }));
}

async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toasts.show(m.admin.copied, 'info');
  } catch {
    // Clipboard blocked: nothing to do.
  }
}

export function channelMenu(session: Session, channel: Id): MenuItem[] {
  const store = session.store;
  const c = store.channels.get(channel);
  if (c?.kind !== 'text') return [];
  const server = c.server;
  const items: MenuItem[] = [];
  if (store.isUnread(channel)) items.push({ label: m.notify.markRead, onselect: () => session.markRead(channel) });
  items.push(...notifyItems(session, 'channel', channel, 'channel'), 'separator');
  const mine = permissionsIn(store, c);
  if (has(mine, Permission.InviteOthers)) items.push({ label: m.admin.invite.people, onselect: () => adminDialogs.open({ kind: 'invite', server, channel }) });
  if (has(mine, Permission.ManageChannel) || has(mine, Permission.ManagePermissions)) {
    items.push({ label: m.admin.editChannel, onselect: () => void openChannelSettings(channel, has(mine, Permission.ManageChannel) ? 'overview' : 'permissions') });
  }
  if (canManageChannels(session, server)) {
    const s = store.servers.get(server)!;
    const shown = (id: Id) => { const x = store.channels.get(id); return !!x && canView(store, x); };
    const up = moveChannel(s.categories, channel, -1, shown);
    const down = moveChannel(s.categories, channel, 1, shown);
    items.push(
      { label: m.admin.moveUp, disabled: !up, onselect: () => writeCategories(session, server, up) },
      { label: m.admin.moveDown, disabled: !down, onselect: () => writeCategories(session, server, down) },
      { label: m.admin.moveToCategory, onselect: () => adminDialogs.open({ kind: 'moveChannel', server, channel }) },
    );
  }
  if (has(mine, Permission.ManageChannel)) {
    items.push({
      label: m.admin.deleteChannel, danger: true,
      onselect: () => void confirm.ask({ title: m.admin.deleteChannelTitle(c.name), body: m.admin.deleteChannelBody, confirm: m.admin.deleteChannel, danger: true })
        .then((ok) => { if (ok) void session.admin.deleteChannel(channel).catch(() => toasts.show(m.admin.channelFailed)); }),
    });
  }
  if (items.length) items.push('separator');
  items.push(
    { label: m.admin.copyLink, onselect: () => void copy(`${location.origin}${resolve('/(app)/app/channels/[server]/[channel]/[[message]]', { server, channel })}`) },
    { label: m.admin.copyId, onselect: () => void copy(channel) },
  );
  return items;
}
