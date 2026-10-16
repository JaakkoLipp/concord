/** DM and group actions (m2b-plan.md task 4), with the confirmations of decision 4. */
import { goto } from '$app/navigation';
import { page } from '$app/state';
import { resolve } from '$app/paths';
import type { Id, Session } from '@concord/domain';
import type { MenuItem } from '@concord/ui';
import { m } from '$lib/i18n/index.ts';
import { confirm } from '$lib/view/confirm.svelte.ts';
import { toasts } from '$lib/view/toast.svelte.ts';
import { message } from './actions.ts';
import { participantMenu } from '$lib/call/menu.ts';
import { app } from '$lib/session/app.svelte.ts';

const failed = () => toasts.show(m.groups.failed);
const open = (channel: Id) => goto(resolve('/(app)/app/channels/@me/[channel]/[[message]]', { channel }));

/** Stoat needs a name: without one, the group is named after its members, as many as fit in 32 characters. */
export function defaultGroupName(session: Session, users: Id[]): string {
  // Stoat counts code points, so an emoji is one and is never cut in half.
  const names = users.map((u) => session.store.displayName(u));
  let out = '';
  for (const n of names) {
    const next = out ? `${out}, ${n}` : n;
    if ([...next].length > 32) return out ? out : [...n].slice(0, 32).join('');
    out = next;
  }
  return out;
}

/** How many more people a group can take: Stoat's group size, and at most 49 invitees when creating one. */
export function room(session: Session, members: number): number {
  const size = session.store.node?.social.groupSize ?? 100;
  return Math.max(0, Math.min(49, size - members));
}

/** One friend opens the DM, several make a group. */
export async function startConversation(session: Session, users: Id[], name: string): Promise<void> {
  if (users.length === 1) return message(session, users[0]!);
  const id = await session.createGroup(name || defaultGroupName(session, users), users);
  await open(id);
}

export async function leaveGroup(session: Session, group: Id): Promise<void> {
  const c = session.store.channels.get(group);
  if (c?.kind !== 'group') return;
  if (!(await confirm.ask({ title: m.groups.leaveTitle(c.name), body: m.groups.leaveBody, confirm: m.groups.leave, danger: true }))) return;
  const here = page.params.channel === group;
  try {
    await session.leaveGroup(group);
    if (here) await goto(resolve('/app/channels/@me'));
  } catch {
    failed();
  }
}

export function closeDm(session: Session, channel: Id): void {
  session.closeDm(channel);
  if (page.params.channel === channel) void goto(resolve('/app/channels/@me'));
}

/** A member's menu inside a group: the person's actions, then what the owner may do to them. */
export function memberMenu(session: Session, group: Id, user: Id, profile?: () => void): MenuItem[] {
  const items = participantMenu(session, app.voice, user, profile ? { profile } : {});
  const c = session.store.channels.get(group);
  const self = session.store.selfId;
  if (c?.kind !== 'group' || c.owner !== self || user === self) return items;
  const name = session.store.displayName(user);
  return [
    ...items,
    'separator',
    {
      label: m.groups.makeOwner,
      onselect: async () => {
        if (!(await confirm.ask({ title: m.groups.ownerTitle(name), body: m.groups.ownerBody, confirm: m.groups.makeOwner }))) return;
        session.editGroup(group, { owner: user }).catch(failed);
      },
    },
    {
      label: m.groups.remove, danger: true,
      onselect: async () => {
        if (!(await confirm.ask({ title: m.groups.removeTitle(name), body: m.groups.removeBody(name), confirm: m.groups.remove, danger: true }))) return;
        session.removeGroupMember(group, user).catch(failed);
      },
    },
  ];
}
