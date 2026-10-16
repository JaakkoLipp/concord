/**
 * The participant menu (client.md section 10.3), on a call tile, a voice row in the sidebar, the member list, a DM
 * and its header: the grouped person menu, with volume and "Mute for me" only in a shared call. Volumes and
 * mutes stay on this device.
 */
import type { MenuItem } from '@concord/ui';
import { type Id, type Session } from '@concord/domain';
import { m } from '$lib/i18n/index.ts';
import { personMenu, startCall } from '$lib/people/actions.ts';
import type { VoiceController } from '$lib/voice/controller.svelte.ts';
import { streamVolumeKey } from '$lib/voice/settings.ts';

export function participantMenu(
  session: Session, voice: VoiceController | null, user: Id,
  opts: { profile?: () => void; server?: Id | undefined; inDm?: boolean; primary?: boolean },
): MenuItem[] {
  const sameCall = voice?.channel && voice.status !== 'none' && voice.status !== 'disconnected'
    && !!session.store.voice.get(voice.channel)?.[user];
  const controls = sameCall && voice && user !== session.store.selfId && !session.store.users.get(user)?.bot
    ? voiceItems(voice, user) : [];
  return personMenu(session, user, { ...opts, voice: controls, startCall: voice ? () => void startCall(session, voice, user) : undefined });
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
