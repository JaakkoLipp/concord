/**
 * One LiveKit connection (client.md sections 10.2 to 10.7). Loaded with `import()` on the first join, so
 * livekit-client stays out of the main bundle: nothing else may import livekit-client at runtime.
 *
 * It connects, publishes the microphone, plays remote audio, applies mute, deafen and volumes, and reports
 * what happens to the controller through a sink. Rejoining is the controller's: when this room ends, it ends.
 *
 * Never send LiveKit data: voice-ingress disconnects anyone who does. A lint rule bans the data calls.
 */
import {
  LocalAudioTrack, Room, RoomEvent, Track, type LocalTrack, type Participant, type RemoteParticipant, type RemoteTrack, type RemoteTrackPublication,
} from 'livekit-client';
import { setReceiving } from './controls.ts';
import { openMic, type MicChain } from './mic.ts';
import { Peers } from './peers.ts';
import { lossBetween, sample, type Sample } from './stats.ts';

export type Quality = 'excellent' | 'good' | 'poor' | 'lost' | 'unknown';

/** What the call tells the controller. */
export interface CallSink {
  /** LiveKit is resuming or restarting the connection, or has recovered it. */
  reconnecting(): void;
  reconnected(): void;
  /** The room ended, with LiveKit's DisconnectReason. Only after the connect succeeded. */
  ended(reason: number | undefined): void;
  speaking(ids: string[]): void;
  quality(q: Quality): void;
  stats(s: { rtt?: number; loss?: number }): void;
  /** Someone else joined or left this call. */
  peer(change: 'join' | 'leave'): void;
  micFailed(error: unknown): void;
}

export interface CallOptions {
  muted: boolean;
  deafened: boolean;
  /** Whether this account may speak in the channel. Without it, the call only listens. */
  canSpeak: boolean;
  /** Mix remote audio with Web Audio, for volumes above 100 % (Chromium only). */
  webAudioMix: boolean;
  volumes: ReadonlyMap<string, number>;
}

export interface Call {
  setMuted(muted: boolean): Promise<void>;
  setDeafened(deafened: boolean): void;
  setVolume(user: string, volume: number): void;
  setPushToTalk(down: boolean): void;
  disconnect(): Promise<void>;
}

const STATS_EVERY_MS = 2_000;

export async function connect(url: string, token: string, options: CallOptions, sink: CallSink): Promise<Call> {
  let { muted, deafened } = options;
  const volumes = new Map(options.volumes);
  const room = new Room({
    adaptiveStream: { pixelDensity: 'screen' },
    dynacast: true,
    webAudioMix: options.webAudioMix,
    disconnectOnPageLeave: true,
  });
  const peers = new Peers();
  /** Remote audio elements live here, out of sight. */
  const box = document.createElement('div');
  box.hidden = true;
  document.body.append(box);
  let up = false;
  let chain: MicChain | null = null;
  let mic: LocalAudioTrack | null = null;
  let statsTimer: ReturnType<typeof setInterval> | null = null;
  let lastSample: Sample | undefined;

  const live = () => room.state === 'connected';
  const remotes = () => room.remoteParticipants.values();
  const applyVolume = (p: RemoteParticipant) => {
    const v = volumes.get(p.identity);
    if (v !== undefined) p.setVolume(v);
  };
  const cleanup = () => {
    if (statsTimer) clearInterval(statsTimer);
    statsTimer = null;
    chain?.stop();
    chain = null;
    mic = null;
    box.remove();
  };

  room
    .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, pub: RemoteTrackPublication) => {
      if (track.kind !== Track.Kind.Audio) return;
      box.append(track.attach());
      if (deafened) pub.setEnabled(false);
    })
    .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
      for (const el of track.detach()) el.remove();
    })
    .on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
      applyVolume(p);
      if (peers.joined(p.identity, live())) sink.peer('join');
    })
    .on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
      // A full restart tears participants down just before the room says it is reconnecting, so look after it has.
      setTimeout(() => { if (peers.left(p.identity, live())) sink.peer('leave'); });
    })
    .on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => sink.speaking(speakers.map((s) => s.identity)))
    .on(RoomEvent.ConnectionQualityChanged, (q, p: Participant) => {
      if (p.identity === room.localParticipant.identity) sink.quality(q as Quality);
    })
    .on(RoomEvent.Reconnecting, () => sink.reconnecting())
    .on(RoomEvent.Reconnected, () => {
      // A full restart forgets disabled tracks, and recreates participants with their default volumes.
      if (deafened) setReceiving(remotes(), false);
      for (const p of remotes()) applyVolume(p);
      setTimeout(() => peers.reconcile(room.remoteParticipants.keys()));
      sink.reconnected();
    })
    .on(RoomEvent.AudioPlaybackStatusChanged, () => {
      // Autoplay was refused: start audio on the next click or key anywhere.
      if (room.canPlaybackAudio) return;
      const start = () => void room.startAudio().catch(() => {});
      window.addEventListener('pointerdown', start, { once: true, capture: true });
      window.addEventListener('keydown', start, { once: true, capture: true });
    })
    .on(RoomEvent.Disconnected, (reason) => {
      cleanup();
      if (up) sink.ended(reason);
    });

  try {
    await room.connect(url, token, { autoSubscribe: true });
  } catch (e) {
    cleanup();
    throw e;
  }
  up = true;
  peers.seed(room.remoteParticipants.keys());
  for (const p of remotes()) applyVolume(p);
  if (deafened) setReceiving(remotes(), false);
  void room.startAudio().catch(() => {});
  statsTimer = setInterval(() => void readStats(), STATS_EVERY_MS);
  if (options.canSpeak) void publishMic();

  async function publishMic() {
    try {
      const c = await openMic();
      if (room.state === 'disconnected') return c.stop();
      chain = c;
      const track = new LocalAudioTrack(c.track, undefined, true);
      track.source = Track.Source.Microphone;
      mic = track;
      // Joining muted never sends a moment of audio: the track is muted before it is published.
      if (muted) await track.mute();
      // The cast only bridges the SDK's own types under exactOptionalPropertyTypes (`processor?`).
      await room.localParticipant.publishTrack(track as LocalTrack, { source: Track.Source.Microphone, dtx: true, red: true });
    } catch (e) {
      if (room.state !== 'disconnected') sink.micFailed(e);
    }
  }

  async function readStats() {
    // Our own microphone's sender stats, or, when only listening, the first remote audio track's.
    const track = mic ?? [...remotes()].flatMap((p) => [...p.audioTrackPublications.values()]).find((pub) => pub.track)?.track;
    const report = await track?.getRTCStatsReport().catch(() => undefined);
    if (!report) return;
    const s = sample(report.values());
    const loss = lossBetween(lastSample, s);
    lastSample = s;
    sink.stats({ ...(s.rtt !== undefined ? { rtt: s.rtt } : {}), ...(loss !== undefined ? { loss } : {}) });
  }

  return {
    async setMuted(next) {
      muted = next;
      if (mic) await (next ? mic.mute() : mic.unmute());
    },
    setDeafened(next) {
      deafened = next;
      setReceiving(remotes(), !next);
    },
    setVolume(user, volume) {
      volumes.set(user, volume);
      room.remoteParticipants.get(user)?.setVolume(volume);
    },
    setPushToTalk(down) {
      chain?.setPushToTalk(down);
    },
    async disconnect() {
      await room.disconnect();
      cleanup();
    },
  };
}
