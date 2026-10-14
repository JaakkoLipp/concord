/**
 * The participant menu (client.md section 10.3), on a call tile or a voice row in the sidebar: the user's volume,
 * "Mute for me", then the person menu, which starts with Profile. Volumes and mutes stay on this device.
 */
import type { MenuItem } from '@concord/ui';
import type { Id, Session } from '@concord/domain';
import { m } from '$lib/i18n/index.ts';
import { personMenu } from '$lib/people/actions.ts';
import type { VoiceController } from '$lib/voice/controller.svelte.ts';

export function participantMenu(session: Session, voice: VoiceController | null, user: Id, opts: { profile: () => void; server?: Id | undefined }): MenuItem[] {
  const people = personMenu(session, user, opts);
  if (!voice || user === session.store.selfId) return people;
  return [
    {
      kind: 'range', label: m.call.volume, value: Math.round(voice.volumeOf(user) * 100), min: 0, max: voice.maxVolume * 100,
      format: m.call.percent, oninput: (v) => voice.setVolume(user, v / 100),
    },
    { kind: 'check', label: m.call.muteForMe, checked: voice.mutedForMe.has(user), onselect: () => voice.toggleMutedForMe(user) },
    'separator',
    ...people,
  ];
}
