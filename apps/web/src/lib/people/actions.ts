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

/** The overflow menu for a friend in the friends list. */
export function friendMenu(session: Session, user: Id): MenuItem[] {
  return [
    { label: m.friends.actions.remove, danger: true, onselect: () => void removeFriend(session, user) },
    { label: m.friends.actions.block, danger: true, onselect: () => void block(session, user) },
  ];
}
