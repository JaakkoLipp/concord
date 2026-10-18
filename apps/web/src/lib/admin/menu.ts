/** The server menu (m2c-plan.md, "Entry points"), from the sidebar header and a right-click on the rail icon. */
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { Permission, deleteCategory, flatten, foldersOf, has, moveCategory, moveChannel, moveOnRail, removeFolder, removeFromFolder, type Category, type Id, type RailItem, type Session } from '@concord/domain';
import type { MenuItem } from '@concord/ui';
import { m } from '$lib/i18n/index.ts';
import { app } from '$lib/session/app.svelte.ts';
import { channelsWith, isOwner, serverPerms, serverSections } from '$lib/view/admin.ts';
import { canView, permissionsIn, railOf } from '$lib/view/channels.ts';
import { folderDialog } from '$lib/view/folders.svelte.ts';
import { adminDialogs } from './dialogs.svelte.ts';
import { notifyItems, notifyMuteItem, serverNotificationSettingsItem } from '$lib/notify/dialog.svelte.ts';
import { confirm } from '$lib/view/confirm.svelte.ts';
import { toasts } from '$lib/view/toast.svelte.ts';
import { openSettings } from '$lib/settings/modal.svelte.ts';

export function openServerSettings(server: Id, section: string): void {
  openSettings({ kind: 'server', server, section });
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

/** Open the server profile editor if the account may change its nickname or avatar. */
export function editServerProfileItem(session: Session, server: Id): MenuItem | null {
  const mine = serverPerms(session.store, server);
  if (!has(mine, Permission.ChangeNickname) && !has(mine, Permission.ChangeAvatar)) return null;
  return { label: m.admin.editServerProfile, onselect: () => adminDialogs.open({ kind: 'serverProfile', server }) };
}

export function serverMenu(session: Session, server: Id): MenuItem[] {
  const store = session.store;
  const items: MenuItem[] = [];
  const sections: (ReturnType<typeof serverSections>[number] | 'tag')[] = serverSections(store, server);
  if (app.layerMe?.gates.serverCreator && has(serverPerms(store, server), Permission.ManageServer)) sections.push('tag');
  const badge = store.serverBadge(server, (c) => canView(store, c));
  items.push({ label: m.notify.markRead, disabled: !badge.unread && !badge.mentions, onselect: () => void session.markServerRead(server).catch(() => toasts.show(m.notify.markReadFailed)) });
  if (channelsWith(store, server, Permission.InviteOthers).length) {
    if (items.length) items.push('separator');
    items.push({ label: m.people.inviteToServer, onselect: () => adminDialogs.open({ kind: 'invite', server, channel: null }) });
  }
  if (items.length) items.push('separator');
  items.push(
    notifyMuteItem(session, 'server', server, 'server'),
    serverNotificationSettingsItem(session, server),
    { kind: 'check', label: m.admin.hideMutedChannels, checked: !!store.settings.hiddenMutedChannels[server], onselect: () => void session.setHideMutedChannels(server, !store.settings.hiddenMutedChannels[server]).catch(() => toasts.show(m.notify.failed)) },
  );
  // The keyboard path for the rail's drag (M4.8 tasks 10a and 10b). In a folder, a server moves within it.
  const rail = railOf(store);
  const inFolder = rail.some((i) => i.kind === 'folder' && i.folder.servers.includes(server));
  const up = moveOnRail(rail, { kind: 'server', id: server }, -1);
  const down = moveOnRail(rail, { kind: 'server', id: server }, 1);
  items.push('separator',
    { label: m.admin.moveUp, disabled: !up, onselect: () => up && saveRail(session, rail, up) },
    { label: m.admin.moveDown, disabled: !down, onselect: () => down && saveRail(session, rail, down) },
    inFolder
      ? { label: m.shell.folders.removeFromFolder, onselect: () => saveRail(session, rail, removeFromFolder(rail, server)) }
      : { label: m.shell.folders.create, disabled: store.servers.size < 2, onselect: () => folderDialog.open({ kind: 'create', server }) });
  if (sections.length || editServerProfileItem(session, server)) {
    const settings: MenuItem[] = [];
    if (sections.length) settings.push({
      kind: 'submenu', label: m.admin.serverSettings,
      items: sections.map((section) => ({ label: m.admin.sections[section], onselect: () => openServerSettings(server, section) })),
    });
    const profile = editServerProfileItem(session, server);
    if (profile) settings.push(profile);
    items.push('separator', ...settings);
  }
  if (canManageChannels(session, server)) {
    if (items.length) items.push('separator');
    items.push({ label: m.admin.createChannel, onselect: () => adminDialogs.open({ kind: 'createChannel', server, category: null }) });
    items.push({ label: m.admin.createCategory, onselect: () => adminDialogs.open({ kind: 'category', server, id: null }) });
  }
  if (items.length) items.push('separator');
  items.push({ label: m.admin.copyServerId, onselect: () => void copy(server) });
  if (!isOwner(store, server)) {
    items.push('separator', { label: m.admin.leaveServer, danger: true, onselect: () => void leaveServer(session, server) });
  }
  return items;
}

/**
 * Writes a changed rail: only the order when the folders are as they were, else the folders and the order. Every
 * rail edit, from the menus and the drag, goes through here.
 */
export function saveRail(session: Session, before: RailItem[], after: RailItem[]): void {
  const same = JSON.stringify(foldersOf(before)) === JSON.stringify(foldersOf(after));
  if (same && flatten(before).join() === flatten(after).join()) return;
  if (same) void session.setServerOrder(flatten(after)).catch(() => toasts.show(m.shell.serverOrderFailed));
  else void session.setRail(after).catch(() => toasts.show(m.shell.folders.failed));
}

/** A folder on the rail: rename it, move it, read it, or let its servers go (M4.8 task 10b). */
export function folderMenu(session: Session, folder: string): MenuItem[] {
  const store = session.store;
  const rail = railOf(store);
  const item = rail.find((i) => i.kind === 'folder' && i.folder.id === folder);
  if (item?.kind !== 'folder') return [];
  const up = moveOnRail(rail, { kind: 'folder', id: folder }, -1);
  const down = moveOnRail(rail, { kind: 'folder', id: folder }, 1);
  const unread = item.folder.servers.some((s) => { const b = store.serverBadge(s, (c) => canView(store, c)); return b.unread || b.mentions > 0; });
  return [
    { label: m.shell.folders.markRead, disabled: !unread, onselect: () => void Promise.all(item.folder.servers.map((s) => session.markServerRead(s))).catch(() => toasts.show(m.notify.markReadFailed)) },
    'separator',
    { label: m.shell.folders.rename, onselect: () => folderDialog.open({ kind: 'rename', folder }) },
    { label: m.admin.moveUp, disabled: !up, onselect: () => up && saveRail(session, rail, up) },
    { label: m.admin.moveDown, disabled: !down, onselect: () => down && saveRail(session, rail, down) },
    'separator',
    { label: m.shell.folders.remove, danger: true, onselect: () => saveRail(session, rail, removeFolder(rail, folder)) },
  ];
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

export function openChannelSettings(channel: Id, section: string): void {
  openSettings({ kind: 'channel', channel, section });
}

async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toasts.show(m.admin.copied, 'info');
  } catch {
    // Clipboard blocked: nothing to do.
  }
}

/**
 * Invite and Edit channel, for those who may: the channel menu's items and the channel row's buttons
 * (m4.6-plan.md task 7) use the same checks.
 */
export function channelActions(session: Session, channel: Id): { invite: (() => void) | null; edit: (() => void) | null } {
  const c = session.store.channels.get(channel);
  if (c?.kind !== 'text') return { invite: null, edit: null };
  const mine = permissionsIn(session.store, c);
  const server = c.server;
  return {
    invite: has(mine, Permission.InviteOthers) ? () => adminDialogs.open({ kind: 'invite', server, channel }) : null,
    edit: has(mine, Permission.ManageChannel) || has(mine, Permission.ManagePermissions)
      ? () => openChannelSettings(channel, has(mine, Permission.ManageChannel) ? 'overview' : 'permissions') : null,
  };
}

/**
 * Delete a channel, for whoever holds Manage channel in it (m4.7-plan.md task 11, Jaakko's decision): its name typed first,
 * since its messages and files go for good, and an optional reason for the audit log.
 */
export async function deleteChannel(session: Session, channel: Id): Promise<void> {
  const c = session.store.channels.get(channel);
  if (c?.kind !== 'text') return;
  const reason = await confirm.askReason({ title: m.admin.deleteChannelTitle(c.name), body: m.admin.deleteChannelBody, confirm: m.admin.deleteChannel, danger: true, typed: c.name });
  if (reason === null) return;
  await session.admin.deleteChannel(channel, reason || undefined).catch(() => toasts.show(m.admin.channelFailed));
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
  const act = channelActions(session, channel);
  if (act.invite) items.push({ label: m.admin.invite.people, onselect: act.invite });
  if (act.edit) items.push({ label: m.admin.editChannel, onselect: act.edit });
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
  // Manage channel in this channel, through any role or as the owner: what Stoat checks for DELETE /channels/{id}.
  if (has(mine, Permission.ManageChannel)) {
    items.push({ label: m.admin.deleteChannel, danger: true, onselect: () => void deleteChannel(session, channel) });
  }
  if (items.length) items.push('separator');
  items.push(
    { label: m.admin.copyLink, onselect: () => void copy(`${location.origin}${resolve('/(app)/app/channels/[server]/[channel]/[[message]]', { server, channel })}`) },
    { label: m.admin.copyId, onselect: () => void copy(channel) },
  );
  return items;
}
