/** Sidebar helpers for who is in voice (client.md section 10.3). */
import { memberKey, type Id, type Store, type VoiceState } from '@concord/domain';

/** A voice channel's timer: `m:ss` under an hour, then `h:mm:ss`, as in the reference. Never negative under clock skew. */
export function elapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export interface VoiceMarks {
  /** Not publishing a microphone, and not server muted, which shows instead. */
  muted: boolean;
  serverMuted: boolean;
  serverDeafened: boolean;
  camera: boolean;
  live: boolean;
}

/** The icons a participant row shows. Server mute and deafen live on the member, so only server channels have them. */
export function voiceMarks(store: Store, v: VoiceState, server: Id | undefined): VoiceMarks {
  const member = server ? store.members.get(memberKey(server, v.user)) : undefined;
  const serverMuted = !!member && !member.canPublish;
  return {
    muted: !v.publishing && !serverMuted, serverMuted, serverDeafened: !!member && !member.canReceive, camera: v.camera, live: v.screensharing,
  };
}
