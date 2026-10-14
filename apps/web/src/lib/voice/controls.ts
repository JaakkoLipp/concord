/**
 * Mute and deafen (client.md sections 10.3 and 10.5), as Discord does them: deafen also mutes, undeafening
 * restores the mute from before, and unmuting while deafened undeafens. They work outside a call too, and
 * apply at the next join.
 */

export interface Controls {
  muted: boolean;
  deafened: boolean;
  /** Whether the microphone was muted when deafen went on. */
  mutedBeforeDeafen: boolean;
}

export const CONTROLS: Controls = { muted: false, deafened: false, mutedBeforeDeafen: false };

export function toggleMute(c: Controls): Controls {
  if (c.deafened) return { muted: false, deafened: false, mutedBeforeDeafen: false };
  return { ...c, muted: !c.muted };
}

export function toggleDeafen(c: Controls): Controls {
  if (c.deafened) return { muted: c.mutedBeforeDeafen, deafened: false, mutedBeforeDeafen: false };
  return { muted: true, deafened: true, mutedBeforeDeafen: c.muted };
}

/** The parts of a LiveKit remote participant that deafen touches. */
export interface Receivable {
  audioTrackPublications: Map<string, { setEnabled(enabled: boolean): void }>;
}

/**
 * Deafen: tell the server to stop sending every remote audio track, screen-share audio included, or to send
 * it again. Subscriptions stay, so speaking indicators keep working. A full restart and late tracks forget it,
 * so the call reapplies this on TrackSubscribed and Reconnected.
 */
export function setReceiving(participants: Iterable<Receivable>, receiving: boolean): void {
  for (const p of participants) for (const pub of p.audioTrackPublications.values()) pub.setEnabled(receiving);
}

/** Per-user volume is capped at 200 % where Web Audio mixing is on, and 100 % elsewhere (client.md section 10.5). */
export const clampVolume = (v: number, max: number) => Math.min(max, Math.max(0, Number.isFinite(v) ? v : 1));
