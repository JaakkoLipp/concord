/**
 * What you can do about another person, shared by the friends list, popouts and context menus
 * (m2b-plan.md tasks 2 and 3). Each action asks first where decision 4 says so, and shows a toast on failure.
 */
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { BackendError, type Id, type Session } from '@concord/domain';
import type { MenuItem } from '@concord/ui';
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

/**
 * Everything you can do about a person, for context menus. With `primary: false`, the actions a profile
 * card already shows as buttons are left out.
 */
export function personMenu(session: Session, user: Id, opts: { profile?: () => void; primary?: boolean; inDm?: boolean } = {}): MenuItem[] {
  const u = session.store.users.get(user);
  const primary = opts.primary ?? true;
  const items: MenuItem[] = [];
  if (opts.profile) items.push({ label: m.people.viewProfile, onselect: opts.profile });
  if (u && user !== session.store.selfId && !u.bot) {
    const rel = u.relationship;
    if (primary) {
      if (rel === 'Friend' && !opts.inDm) items.push({ label: m.friends.actions.message, onselect: () => void message(session, user) });
      if (rel === 'None') items.push({ label: m.people.addFriend, onselect: () => request(session, user) });
      if (rel === 'Incoming') {
        items.push({ label: m.friends.actions.accept, onselect: () => accept(session, user) });
        items.push({ label: m.friends.actions.ignore, onselect: () => dropRequest(session, user) });
      }
      if (rel === 'Outgoing') items.push({ label: m.friends.actions.cancel, onselect: () => dropRequest(session, user) });
    }
    if (items.length) items.push('separator');
    if (rel === 'Friend') items.push({ label: m.friends.actions.remove, danger: true, onselect: () => void removeFriend(session, user) });
    if (rel === 'Blocked') {
      if (primary) items.push({ label: m.friends.actions.unblock, onselect: () => unblock(session, user) });
    } else {
      items.push({ label: m.friends.actions.block, danger: true, onselect: () => void block(session, user) });
    }
  }
  if (items.length && items.at(-1) !== 'separator') items.push('separator');
  if (u) items.push({ label: m.people.copyUsername, onselect: () => void copy(`${u.username}#${u.discriminator}`) });
  items.push({ label: m.people.copyId, onselect: () => void copy(user) });
  return items;
}

/** The overflow menu for a friend in the friends list. */
export function friendMenu(session: Session, user: Id): MenuItem[] {
  return [
    { label: m.friends.actions.remove, danger: true, onselect: () => void removeFriend(session, user) },
    { label: m.friends.actions.block, danger: true, onselect: () => void block(session, user) },
  ];
}
