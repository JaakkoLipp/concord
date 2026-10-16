/**
 * What you can do about another person, shared by the friends list, popouts and context menus
 * (m2b-plan.md tasks 2 and 3). Each action asks first where decision 4 says so, and shows a toast on failure.
 */
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { BackendError, Permission, type Id, type Session } from '@concord/domain';
import type { MenuItem } from '@concord/ui';
import { nicknameItem, roleItem, moderationPanelItem, kickBanItems } from '$lib/admin/members.ts';
import { editServerProfileItem } from '$lib/admin/menu.ts';
import { moderationItems } from '$lib/call/moderation.ts';
import { channelsWith } from '$lib/view/admin.ts';
import { orderedServers } from '$lib/view/channels.ts';
import { compose } from '$lib/view/compose.svelte.ts';
import type { VoiceController } from '$lib/voice/controller.svelte.ts';
import { m } from '$lib/i18n/index.ts';
import { confirm } from '$lib/view/confirm.svelte.ts';
import { toasts } from '$lib/view/toast.svelte.ts';

const failed = () => toasts.show(m.friends.errors.action);
const nameOf = (session: Session, user: Id) => session.store.displayName(user);

/** Why a friend request failed, in plain words. */
export function friendError(session: Session, e: unknown): string {
  if (!(e instanceof BackendError)) return m.friends.errors.network;
  switch (e.kind) {
    case 'InvalidProperty': return m.friends.errors.format;
    case 'NotFound':
    case 'NoEffect':
    case 'AlreadyFriends':
    case 'AlreadySentRequest':
    case 'Blocked':
    case 'BlockedByOther':
    case 'IsBot':
      return m.friends.errors[e.kind];
    case 'TooManyPendingFriendRequests': return m.friends.errors.TooManyPendingFriendRequests(session.friendRequestLimit());
    default: return m.friends.errors.other(e.kind);
  }
}

export async function message(session: Session, user: Id): Promise<void> {
  try {
    const channel = await session.openDm(user);
    await goto(resolve('/(app)/app/channels/@me/[channel]/[[message]]', { channel }));
  } catch {
    failed();
  }
}

export function request(session: Session, user: Id): void {
  session.requestFriend(user).catch((e: unknown) => toasts.show(friendError(session, e)));
}

export function accept(session: Session, user: Id): void {
  session.acceptFriend(user).catch(failed);
}

/** Ignore an incoming request or cancel an outgoing one. No confirmation. */
export function dropRequest(session: Session, user: Id): void {
  session.removeFriend(user).catch(failed);
}

export async function removeFriend(session: Session, user: Id): Promise<void> {
  const name = nameOf(session, user);
  if (!(await confirm.ask({ title: m.friends.confirm.removeTitle(name), body: m.friends.confirm.removeBody(name), confirm: m.friends.confirm.removeConfirm, danger: true }))) return;
  session.removeFriend(user).catch(failed);
}

export async function block(session: Session, user: Id): Promise<void> {
  const name = nameOf(session, user);
  if (!(await confirm.ask({ title: m.friends.confirm.blockTitle(name), body: m.friends.confirm.blockBody(name), confirm: m.friends.confirm.blockConfirm, danger: true }))) return;
  session.block(user).catch(failed);
}

export function unblock(session: Session, user: Id): void {
  session.unblock(user).catch(failed);
}

async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toasts.show(m.actions.copied, 'info');
  } catch {
    // Clipboard blocked: nothing to do.
  }
}

/** Open the DM and start its call; Stoat rings the other person when we join. */
export async function startCall(session: Session, voice: VoiceController, user: Id): Promise<void> {
  try {
    const channel = await session.openDm(user);
    await goto(resolve('/(app)/app/channels/@me/[channel]/[[message]]', { channel }));
    voice.join(channel);
  } catch {
    failed();
  }
}

/** Send an invite to this person in their DM. The invite is created only after choosing a server. */
async function invitePerson(session: Session, user: Id, server: Id): Promise<void> {
  const channel = channelsWith(session.store, server, Permission.InviteOthers)[0];
  if (!channel) return;
  try {
    const dm = await session.openDm(user);
    const invite = await session.admin.createInvite(channel);
    await session.backend.sendMessage(dm, { content: location.origin + '/invite/' + invite.code, replies: [], attachments: [] }, crypto.randomUUID());
    toasts.show(m.people.inviteSent(session.store.servers.get(server)?.name ?? ''), 'info');
  } catch {
    toasts.show(m.people.inviteFailed);
  }
}

export interface PersonMenuOptions {
  profile?: (() => void) | undefined;
  primary?: boolean;
  inDm?: boolean;
  server?: Id | undefined;
  voice?: MenuItem[];
  startCall?: (() => void) | undefined;
}

/** The person menu, grouped as in m4.7-plan.md task 4. Empty groups never leave stray separators. */
export function personMenu(session: Session, user: Id, opts: PersonMenuOptions = {}): MenuItem[] {
  const store = session.store;
  const u = store.users.get(user);
  const own = user === store.selfId;
  const primary = opts.primary ?? true;
  const items: MenuItem[] = [];
  const group = (...entries: (MenuItem | null | undefined)[]) => {
    const present = entries.filter((item): item is MenuItem => !!item);
    if (!present.length) return;
    if (items.length) items.push('separator');
    items.push(...present);
  };
  const first: MenuItem[] = [];
  if (opts.profile) first.push({ label: m.people.viewProfile, onselect: opts.profile });
  first.push({ label: m.people.mention, onselect: () => compose.mention(user) });
  if (!own && u && !u.bot && primary) {
    first.push({ label: m.friends.actions.message, onselect: () => void message(session, user) });
    if (opts.startCall) first.push({ label: m.people.startCall, disabled: u.relationship !== 'Friend', onselect: opts.startCall });
  }
  group(...first);
  if (own) {
    if (opts.server) {
      group(editServerProfileItem(session, opts.server));
      group(roleItem(session, opts.server, user));
      group(moderationPanelItem(session, opts.server, user));
    }
  } else {
    group(...(opts.voice ?? []));
    const social: MenuItem[] = [];
    if (opts.server) {
      const nickname = nicknameItem(session, opts.server, user);
      if (nickname) social.push(nickname);
    }
    if (u && !u.bot) {
      const rel = u.relationship;
      const servers = orderedServers(store).filter((s) => channelsWith(store, s.id, Permission.InviteOthers).length);
      if (servers.length && rel === 'Friend') social.push({
        kind: 'submenu', label: m.people.inviteToServer,
        items: servers.map((s) => ({ label: s.name, onselect: () => void invitePerson(session, user, s.id) })),
      });
      if (primary) {
        if (rel === 'None') social.push({ label: m.people.addFriend, onselect: () => request(session, user) });
        if (rel === 'Incoming') social.push(
          { label: m.friends.actions.accept, onselect: () => accept(session, user) },
          { label: m.friends.actions.ignore, onselect: () => dropRequest(session, user) },
        );
        if (rel === 'Outgoing') social.push({ label: m.friends.actions.cancel, onselect: () => dropRequest(session, user) });
      }
      if (rel === 'Friend') social.push({ label: m.friends.actions.remove, danger: true, onselect: () => void removeFriend(session, user) });
      if (rel === 'Blocked') {
        if (primary) social.push({ label: m.friends.actions.unblock, onselect: () => unblock(session, user) });
      } else social.push({ label: m.friends.actions.block, danger: true, onselect: () => void block(session, user) });
    }
    group(...social);
    if (opts.server) {
      group(roleItem(session, opts.server, user));
      group(moderationPanelItem(session, opts.server, user), ...moderationItems(session, user, opts.server), ...kickBanItems(session, opts.server, user));
    }
  }
  group({ label: m.people.copyId, onselect: () => void copy(user) });
  return items;
}

/** The overflow menu for a friend in the friends list. */
export function friendMenu(session: Session, user: Id): MenuItem[] {
  return [
    { label: m.friends.actions.remove, danger: true, onselect: () => void removeFriend(session, user) },
    { label: m.friends.actions.block, danger: true, onselect: () => void block(session, user) },
  ];
}
