/** Server voice moderation, shared by the person menu and the moderation panel. */
import { memberKey, type Id, type Session } from '@concord/domain';
import type { MenuItem } from '@concord/ui';
import { m } from '$lib/i18n/index.ts';
import { setServerFlag, voiceModeration } from '$lib/admin/voice.ts';
import { moves } from '$lib/admin/moves.svelte.ts';

/**
 * Server mute, server deafen and a move, for someone below you in a server call (m4.7-plan.md task 3). Moves open a submenu of allowed destinations.
 * `reason` is read when an item is chosen: the moderation panel's reason field, for the audit log (task 6).
 */
export function moderationItems(session: Session, user: Id, server?: Id, reason: () => string | undefined = () => undefined): MenuItem[] {
  const mod = voiceModeration(session, user);
  if (!mod || (server && mod.server !== server)) return [];
  const store = session.store;
  const member = store.members.get(memberKey(mod.server, user));
  const items: MenuItem[] = [];
  if (mod.canMute) items.push({ kind: 'check', label: m.voiceMod.serverMute, checked: !!member && !member.canPublish, onselect: () => void setServerFlag(session, mod.server, user, 'canPublish', !!member && !member.canPublish, reason()) });
  if (mod.canDeafen) items.push({ kind: 'check', label: m.voiceMod.serverDeafen, checked: !!member && !member.canReceive, onselect: () => void setServerFlag(session, mod.server, user, 'canReceive', !!member && !member.canReceive, reason()) });
  const destinations = mod.destinations.flatMap((id) => {
    const c = store.channels.get(id);
    return c?.kind === 'text' ? [{ label: c.name, disabled: moves.isPending(user), onselect: () => void moves.move(session, user, id, reason()) }] : [];
  });
  if (destinations.length) items.push({ kind: 'submenu', label: m.people.moveTo, items: destinations });
  return items;
}
