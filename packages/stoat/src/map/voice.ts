import type { VoiceFlags, VoiceState } from '@concord/domain';

/**
 * Stoat's voice shapes (backend 0.15.5 `UserVoiceState` and `ChannelVoiceState`). They aren't in the
 * OpenAPI schema, since they travel only over the socket.
 */
export interface WVoiceState {
  id: string;
  /** ISO 8601 in JSON. Stoat's own SDK types it as a number, so both are accepted. */
  joined_at: string | number;
  is_receiving: boolean;
  is_publishing: boolean;
  screensharing: boolean;
  camera: boolean;
}

export interface WChannelVoiceState {
  id: string;
  participants: WVoiceState[];
}

/** Epoch milliseconds. A number below 10^12 is taken as seconds. */
export function time(t: string | number | undefined | null): number {
  if (typeof t === 'number') return t < 1e12 ? t * 1000 : t;
  const ms = Date.parse(t ?? '');
  return Number.isNaN(ms) ? 0 : ms;
}

export function mapVoiceState(channel: string, s: WVoiceState): VoiceState {
  return {
    user: s.id, channel, joinedAt: time(s.joined_at),
    publishing: !!s.is_publishing, receiving: s.is_receiving ?? true, screensharing: !!s.screensharing, camera: !!s.camera,
  };
}

/** Every participant of every occupied channel, as Ready and ServerCreate list them. */
export const mapChannelVoiceStates = (list: WChannelVoiceState[] | undefined): VoiceState[] =>
  (list ?? []).flatMap((c) => (c.participants ?? []).map((s) => mapVoiceState(c.id, s)));

/** `UserVoiceStateUpdate.data` holds only the flags that changed. */
export function mapVoiceFlags(d: Partial<WVoiceState>): Partial<VoiceFlags> {
  const out: Partial<VoiceFlags> = {};
  if (typeof d.is_publishing === 'boolean') out.publishing = d.is_publishing;
  if (typeof d.is_receiving === 'boolean') out.receiving = d.is_receiving;
  if (typeof d.screensharing === 'boolean') out.screensharing = d.screensharing;
  if (typeof d.camera === 'boolean') out.camera = d.camera;
  return out;
}
