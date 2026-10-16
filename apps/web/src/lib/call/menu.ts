/**
 * The participant menu (client.md section 10.3), on a call tile, a voice row in the sidebar, the member list, a DM
 * and its header: the user's volume, "Mute for me", then the person menu, which starts with Profile. Volumes and
 * mutes stay on this device.
 */
import type { MenuItem } from '@concord/ui';
import { memberKey, type Id, type Session } from '@concord/domain';
import { m } from '$lib/i18n/index.ts';
import { setServerFlag, voiceModeration } from '$lib/admin/voice.ts';
import { moves } from '$lib/admin/moves.svelte.ts';
import { personMenu } from '$lib/people/actions.ts';
import type { VoiceController } from '$lib/voice/controller.svelte.ts';
import { streamVolumeKey } from '$lib/voice/settings.ts';

export function participantMenu(
  session: Session, voice: VoiceController | null, user: Id,
  opts: { profile?: () => void; server?: Id | undefined; inDm?: boolean; primary?: boolean },
): MenuItem[] {
  const people = personMenu(session, user, opts);
  const moderation = moderationItems(session, user);
  const rest = moderation.length ? [...moderation, 'separator' as const, ...people] : people;
  if (!voice || user === session.store.selfId || session.store.users.get(user)?.bot) return rest;
  return [...voiceItems(voice, user), 'separator', ...rest];
}

/**
 * Server mute, server deafen and a move, for someone below you in a server call (m4.7-plan.md task 3). Moves are flat
 * items until the menu has submenus (task 4).
 */
export function moderationItems(session: Session, user: Id): MenuItem[] {
  const mod = voiceModeration(session, user);
  if (!mod) return [];
  const store = session.store;
  const member = store.members.get(memberKey(mod.server, user));
  const items: MenuItem[] = [];
  if (mod.canMute) items.push({ kind: 'check', label: m.voiceMod.serverMute, checked: !!member && !member.canPublish, onselect: () => void setServerFlag(session, mod.server, user, 'canPublish', !!member && !member.canPublish) });
  if (mod.canDeafen) items.push({ kind: 'check', label: m.voiceMod.serverDeafen, checked: !!member && !member.canReceive, onselect: () => void setServerFlag(session, mod.server, user, 'canReceive', !!member && !member.canReceive) });
  for (const id of mod.destinations) {
    const c = store.channels.get(id);
    if (c?.kind === 'text') items.push({ label: m.voiceMod.moveTo(c.name), disabled: moves.isPending(user), onselect: () => void moves.move(session, user, id) });
  }
  return items;
}

/** The user's volume and "Mute for me", which work in and out of a call (m4.5-plan.md task 5). */
export function voiceItems(voice: VoiceController, user: Id): MenuItem[] {
  return [
    {
      kind: 'range', label: m.call.volume, value: Math.round(voice.volumeOf(user) * 100), min: 0, max: voice.maxVolume * 100,
      format: m.call.percent, oninput: (v) => voice.setVolume(user, v / 100),
    },
    { kind: 'check', label: m.call.muteForMe, checked: voice.mutedForMe.has(user), onselect: () => voice.toggleMutedForMe(user) },
  ];
}

/** A stream's own volume, on its tile's menu. */
export function streamVolumeItem(voice: VoiceController, user: Id): MenuItem {
  const key = streamVolumeKey(user);
  return {
    kind: 'range', label: m.call.streamVolume, value: Math.round(voice.volumeOf(key) * 100), min: 0, max: voice.maxVolume * 100,
    format: m.call.percent, oninput: (v) => voice.setVolume(key, v / 100),
  };
}
