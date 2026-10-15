/**
 * One LiveKit connection (client.md sections 10.2 to 10.7). Loaded with `import()` on the first join, so
 * livekit-client stays out of the main bundle: nothing else may import livekit-client at runtime.
 *
 * It connects, publishes the microphone and camera, plays remote audio, applies mute, deafen and volumes, and
 * reports what happens to the controller through a sink, video included as plain feeds, so nothing outside this
 * module touches a LiveKit type. Rejoining is the controller's: when this room ends, it ends.
 *
 * Never send LiveKit data: voice-ingress disconnects anyone who does. A lint rule bans the data calls.
 */
import {
  LocalAudioTrack, Room, RoomEvent, Track, VideoPreset, VideoQuality, createLocalVideoTrack,
  type AudioCaptureOptions, type LocalTrack, type LocalTrackPublication, type LocalVideoTrack, type Participant, type RemoteParticipant, type RemoteTrack, type RemoteTrackPublication, type TrackPublication,
} from 'livekit-client';
import type { VideoLimit } from '@concord/domain';
import { setReceiving } from './controls.ts';
import { VideoLimitError, fitTier, withinTier, type Size } from './limits.ts';
import { openMic, type MicChain } from './mic.ts';
import { loadVoiceSettings, onVoiceSettings, streamVolumeKey, userOfVolumeKey } from './settings.ts';
import type { SharePlan } from './share.ts';
import { sharerStats, viewerStats, type Counters, type SharerStats, type ViewerStats } from './videostats.ts';
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
  /** The video in the call changed: cameras and screen shares, our own included. */
  feeds(feeds: Feed[]): void;
  /** Our screen share started or stopped, from the app or the browser's own stop button. */
  sharing(on: boolean): void;
}

export type FeedSource = 'camera' | 'screen';
/** A viewer's cap on a feed's layer. Auto leaves it to adaptive streaming, by the tile's size. */
export type FeedQuality = 'auto' | '1080p' | '720p' | '360p';

/** One video track, for a tile. The same object for as long as the track lives. */
export interface Feed {
  id: string;
  user: string;
  source: FeedSource;
  local: boolean;
  /**
   * Plays it in an element. Remote video only starts once attached: adaptive streaming sizes the layer to the
   * element and pauses it while hidden.
   */
  attach(el: HTMLVideoElement): void;
  /**
   * Someone else's screen share starts unwatched, as on Discord (m4.5-plan.md task 6): nothing of it is received,
   * video or audio, until `watch(true)`. Cameras and our own feeds are always watched.
   */
  watching: boolean;
  watch(on: boolean): void;
  detach(el: HTMLVideoElement): void;
  setQuality(q: FeedQuality): void;
  /** The stats overlay's figures: a viewer's for a remote feed, the sharer's for our own. */
  stats(): Promise<{ viewer?: ViewerStats; sharer?: SharerStats } | null>;
}

export interface CallOptions {
  /** False once the join was cancelled or replaced: then the call ends as soon as it connects, without the microphone. */
  current: () => boolean;
  muted: boolean;
  deafened: boolean;
  /** Whether this account may speak in the channel. Without it, the call only listens. */
  canSpeak: boolean;
  /** Mix remote audio with Web Audio, for volumes above 100 % (Chromium only). */
  webAudioMix: boolean;
  /** Per-user volume, 1 meaning 100 %, before the output volume. */
  volumes: ReadonlyMap<string, number>;
  /** Users muted for this device only. */
  mutedForMe: ReadonlySet<string>;
}

/** The published microphone's meter, for the settings' mic test during a call. */
export interface MicMeter { level(): number; gateOpen(): boolean }

export interface Call {
  /** The microphone this call publishes, once it is open. */
  mic(): MicMeter | null;
  setMuted(muted: boolean): Promise<void>;
  setDeafened(deafened: boolean): void;
  /** A volume by key: a user's ID for their voice, `streamVolumeKey` for their stream's audio. */
  setVolume(key: string, volume: number): void;
  setMutedForMe(user: string, muted: boolean): void;
  /**
   * Stoat's Speak permission in the channel changed. Gaining it publishes the microphone as soon as LiveKit's
   * permissions for this participant allow it too, without a rejoin (m4.5-plan.md task 8).
   */
  setCanSpeak(on: boolean): void;
  setPushToTalk(down: boolean): void;
  /** Publishes the camera, fitted into the tier, or stops it. */
  setCamera(on: boolean, limit: VideoLimit | null): Promise<void>;
  /**
   * Captures the screen with the browser's picker and publishes it by the plan, with its audio when asked and
   * offered. Call it straight from a click: the picker needs the user's gesture.
   */
  startShare(plan: SharePlan, audio: boolean, limit: VideoLimit | null): Promise<void>;
  stopShare(): Promise<void>;
  disconnect(): Promise<void>;
}

const STATS_EVERY_MS = 2_000;
/** Camera capture before the tier: 720p30, with LiveKit's default simulcast layers (client.md section 10.6). */
const CAMERA = { width: 1280, height: 720, frameRate: 30 };
/**
 * Screen-share audio (client.md section 10.6): no processing, stereo, and not the call itself. These go inside
 * the audio constraints, because LiveKit doesn't pass its own `suppressLocalAudioPlayback` to the browser.
 */
function screenAudio(): AudioCaptureOptions {
  const supported = navigator.mediaDevices.getSupportedConstraints() as Record<string, boolean | undefined>;
  return {
    echoCancellation: false, noiseSuppression: false, autoGainControl: false, voiceIsolation: false, channelCount: 2,
    ...(supported.restrictOwnAudio ? { restrictOwnAudio: true } : {}),
    // The sharer keeps hearing what they share.
    ...(supported.suppressLocalAudioPlayback ? { suppressLocalAudioPlayback: false } : {}),
  } as AudioCaptureOptions;
}
const QUALITY: Record<FeedQuality, VideoQuality> = { auto: VideoQuality.HIGH, '1080p': VideoQuality.HIGH, '720p': VideoQuality.MEDIUM, '360p': VideoQuality.LOW };

/**
 * Brings a capture inside the tier if the browser gave more than was asked: voice-ingress reads the size declared
 * at publish, and that comes from these settings.
 */
async function fitCapture(track: MediaStreamTrack, limit: VideoLimit | null, frameRate: number): Promise<void> {
  const size = (): Size => { const s = track.getSettings(); return { width: s.width ?? 0, height: s.height ?? 0 }; };
  if (withinTier(size(), limit)) return;
  const fit = fitTier(size(), limit);
  if (!fit) throw new VideoLimitError();
  await track.applyConstraints({ width: { max: fit.width }, height: { max: fit.height }, frameRate });
  if (!withinTier(size(), limit)) throw new VideoLimitError();
}

export async function connect(url: string, token: string, options: CallOptions, sink: CallSink): Promise<Call> {
  let { muted, deafened } = options;
  const volumes = new Map(options.volumes);
  const mutedForMe = new Set(options.mutedForMe);
  let output = loadVoiceSettings();
  const room = new Room({
    adaptiveStream: { pixelDensity: 'screen' },
    dynacast: true,
    webAudioMix: options.webAudioMix,
    disconnectOnPageLeave: true,
    ...(output.outputDevice ? { audioOutput: { deviceId: output.outputDevice } } : {}),
  });
  const peers = new Peers();
  /** Remote audio elements live here, out of sight. */
  const box = document.createElement('div');
  box.hidden = true;
  document.body.append(box);
  let up = false;
  let chain: MicChain | null = null;
  let mic: LocalAudioTrack | null = null;
  let camera: LocalVideoTrack | null = null;
  /** Whether the camera should be on: it can be turned off again while it starts. */
  let cameraWanted = false;
  let screen: { video: LocalVideoTrack; audio: LocalAudioTrack | null } | null = null;
  /** Whether a share should be running: it can be stopped while the picker is open. */
  let shareWanted = false;
  /** Feeds by publication, kept while their track is the same, so tiles keep their elements. */
  const feedCache = new Map<string, { track: unknown; feed: Feed }>();
  let statsTimer: ReturnType<typeof setInterval> | null = null;
  let lastSample: Sample | undefined;

  const live = () => room.state === 'connected';
  const remotes = () => room.remoteParticipants.values();
  /**
   * A user's volume times the output volume (client.md section 10.5), within what this browser can play. Their
   * stream's audio has its own volume, under `streamVolumeKey` (m4.5-plan.md task 5).
   */
  const applyVolume = (p: RemoteParticipant) => {
    const level = (own: number) => Math.min(options.webAudioMix ? 2 : 1, Math.max(0, mutedForMe.has(p.identity) ? 0 : own * (output.outputVolume / 100)));
    p.setVolume(level(volumes.get(p.identity) ?? 1), Track.Source.Microphone);
    p.setVolume(level(volumes.get(streamVolumeKey(p.identity)) ?? 1), Track.Source.ScreenShareAudio);
  };
  const stopSettings = onVoiceSettings((s) => {
    const before = output;
    output = s;
    if (s.outputVolume !== before.outputVolume) for (const p of remotes()) applyVolume(p);
    if (s.outputDevice !== before.outputDevice) void room.switchActiveDevice('audiooutput', s.outputDevice || 'default').catch(() => {});
  });

  // Screen shares this device watches, by user. A share that ends is forgotten, so the next one starts unwatched.
  const watched = new Set<string>();
  const isStream = (pub: TrackPublication) => pub.source === Track.Source.ScreenShare || pub.source === Track.Source.ScreenShareAudio;
  /** Subscribes to what this device wants of a participant: voices and cameras always, streams once watched. */
  const subscribeWanted = (p: RemoteParticipant) => {
    for (const pub of p.trackPublications.values()) {
      const want = !isStream(pub) || watched.has(p.identity);
      if (pub.isSubscribed !== want) pub.setSubscribed(want);
    }
  };
  const watch = (user: string, on: boolean) => {
    if (on) watched.add(user);
    else watched.delete(user);
    const p = room.remoteParticipants.get(user);
    if (p) subscribeWanted(p);
    emitFeeds();
  };

  const feedFor = (user: string, pub: TrackPublication, local: boolean): Feed | null => {
    const track = pub.videoTrack;
    const source: FeedSource | null = pub.source === Track.Source.Camera ? 'camera' : pub.source === Track.Source.ScreenShare ? 'screen' : null;
    if (!source || pub.isMuted) return null;
    const id = `${user}/${pub.trackSid}`;
    // Someone's stream before it is watched, or while its subscription is on its way: a tile to click, with
    // nothing received. Clicking again while it's on its way asks again, which is harmless.
    if (!track) {
      if (local || source !== 'screen') return null;
      const cached = feedCache.get(id);
      if (cached && cached.track === null) return cached.feed;
      const waiting: Feed = {
        id, user, source, local, watching: false, watch: (on) => watch(user, on),
        attach: () => {}, detach: () => {}, setQuality: () => {}, stats: async () => null,
      };
      feedCache.set(id, { track: null, feed: waiting });
      return waiting;
    }
    const cached = feedCache.get(id);
    if (cached?.track === track) return cached.feed;
    const counters: Counters = new Map();
    const feed: Feed = {
      id, user, source, local,
      watching: true,
      watch: (on) => { if (!local && source === 'screen') watch(user, on); },
      attach: (el) => void track.attach(el),
      detach: (el) => void track.detach(el),
      setQuality: (q) => { if (!local) (pub as RemoteTrackPublication).setVideoQuality(QUALITY[q]); },
      async stats() {
        if (local) {
          const report = await track.getRTCStatsReport().catch(() => undefined);
          const sharer = report && sharerStats(report.values(), counters);
          return sharer ? { sharer } : null;
        }
        const report = await track.getRTCStatsReport().catch(() => undefined);
        const viewer = report && viewerStats(report.values(), counters, pub.dimensions?.height);
        return viewer ? { viewer } : null;
      },
    };
    feedCache.set(id, { track, feed });
    return feed;
  };
  /** Tells the controller what video there is now. */
  const emitFeeds = () => {
    const out: Feed[] = [];
    const self = room.localParticipant;
    for (const pub of self.videoTrackPublications.values()) { const f = feedFor(self.identity, pub, true); if (f) out.push(f); }
    for (const p of remotes()) for (const pub of p.videoTrackPublications.values()) { const f = feedFor(p.identity, pub, false); if (f) out.push(f); }
    const ids = new Set(out.map((f) => f.id));
    for (const id of feedCache.keys()) if (!ids.has(id)) feedCache.delete(id);
    sink.feeds(out);
  };

  /** Removes the listeners that start audio after the browser blocked autoplay. */
  let unblock: (() => void) | null = null;
  const cleanup = () => {
    unblock?.();
    if (statsTimer) clearInterval(statsTimer);
    statsTimer = null;
    stopSettings();
    chain?.stop();
    chain = null;
    mic = null;
    camera?.stop();
    camera = null;
    screen?.video.stop();
    screen?.audio?.stop();
    screen = null;
    shareWanted = false;
    feedCache.clear();
    box.remove();
  };

  room
    .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, pub: RemoteTrackPublication) => {
      if (track.kind === Track.Kind.Video) return emitFeeds();
      if (track.kind !== Track.Kind.Audio) return;
      box.append(track.attach());
      if (deafened) pub.setEnabled(false);
    })
    .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Video) {
        track.detach();
        // LiveKit says so before it lets go of the track: look once it has.
        return void queueMicrotask(emitFeeds);
      }
      for (const el of track.detach()) el.remove();
    })
    .on(RoomEvent.TrackPublished, (_pub: RemoteTrackPublication, p: RemoteParticipant) => {
      subscribeWanted(p);
      emitFeeds();
    })
    .on(RoomEvent.TrackUnpublished, (pub: RemoteTrackPublication, p: RemoteParticipant) => {
      // A full restart unpublishes everything while reconnecting: what was watched stays watched through it.
      if (pub.source === Track.Source.ScreenShare && room.state === 'connected') watched.delete(p.identity);
      emitFeeds();
    })
    .on(RoomEvent.TrackSubscriptionFailed, (_sid: string, p: RemoteParticipant) => {
      // A stream that couldn't be received goes back to its Watch button.
      watched.delete(p.identity);
      emitFeeds();
    })
    .on(RoomEvent.TrackMuted, emitFeeds)
    .on(RoomEvent.TrackUnmuted, emitFeeds)
    .on(RoomEvent.LocalTrackPublished, emitFeeds)
    .on(RoomEvent.LocalTrackUnpublished, (pub: LocalTrackPublication) => {
      // The browser's own stop button ends the capture, and LiveKit unpublishes it: tidy up the rest.
      if (screen && pub.track === screen.video) void endShare();
      // The microphone taken away, as when Speak is lost: closed, so gaining Speak again publishes a new one.
      if (mic && pub.track === mic) dropMic();
      emitFeeds();
    })
    .on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
      subscribeWanted(p);
      applyVolume(p);
      if (peers.joined(p.identity, live())) sink.peer('join');
    })
    .on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
      // A full restart tears participants down just before the room says it is reconnecting, so look after it has.
      setTimeout(() => { if (peers.left(p.identity, live())) sink.peer('leave'); });
      if (live()) watched.delete(p.identity);
      emitFeeds();
    })
    .on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => sink.speaking(speakers.map((s) => s.identity)))
    .on(RoomEvent.ConnectionQualityChanged, (q, p: Participant) => {
      if (p.identity === room.localParticipant.identity) sink.quality(q as Quality);
    })
    .on(RoomEvent.Reconnecting, () => sink.reconnecting())
    .on(RoomEvent.Reconnected, () => {
      // A full restart forgets disabled tracks, and recreates participants with their default volumes.
      if (deafened) setReceiving(remotes(), false);
      // Streams that ended while the connection was down are forgotten, so their next one starts unwatched.
      for (const user of watched) {
        const p = room.remoteParticipants.get(user);
        if (!p || ![...p.trackPublications.values()].some((pub) => pub.source === Track.Source.ScreenShare)) watched.delete(user);
      }
      for (const p of remotes()) {
        subscribeWanted(p);
        applyVolume(p);
      }
      setTimeout(() => peers.reconcile(room.remoteParticipants.keys()));
      emitFeeds();
      sink.reconnected();
    })
    .on(RoomEvent.AudioPlaybackStatusChanged, () => {
      // Autoplay was refused: start audio on the next click or key anywhere.
      if (room.canPlaybackAudio || unblock) return;
      unblock = () => {
        window.removeEventListener('pointerdown', start, true);
        window.removeEventListener('keydown', start, true);
        unblock = null;
      };
      const start = () => { unblock?.(); void room.startAudio().catch(() => {}); };
      window.addEventListener('pointerdown', start, true);
      window.addEventListener('keydown', start, true);
    })
    .on(RoomEvent.Disconnected, (reason) => {
      cleanup();
      if (up) {
        sink.feeds([]);
        sink.ended(reason);
      }
    });

  try {
    // Subscriptions are chosen here: streams wait until watched (m4.5-plan.md task 6).
    await room.connect(url, token, { autoSubscribe: false });
  } catch (e) {
    cleanup();
    throw e;
  }
  if (!options.current()) {
    await room.disconnect();
    cleanup();
    throw new Error('join cancelled');
  }
  up = true;
  peers.seed(room.remoteParticipants.keys());
  for (const p of remotes()) {
    subscribeWanted(p);
    applyVolume(p);
  }
  if (deafened) setReceiving(remotes(), false);
  emitFeeds();
  void room.startAudio().catch(() => {});
  statsTimer = setInterval(() => void readStats(), STATS_EVERY_MS);
  let canSpeak = options.canSpeak;
  /** Whether LiveKit lets this participant publish a microphone: its token's grant, as updated since. */
  const livekitAllowsMic = () => {
    const p = room.localParticipant.permissions;
    return !p || (p.canPublish && (p.canPublishSources.length === 0 || p.canPublishSources.includes(Track.sourceToProto(Track.Source.Microphone))));
  };
  let micStarting = false;
  let micUnavailable = false;
  const publishIfAllowed = () => {
    if (canSpeak && !mic && !micStarting && !micUnavailable && room.state === 'connected' && livekitAllowsMic()) {
      micStarting = true;
      void publishMic().finally(() => (micStarting = false));
    }
  };
  room.on(RoomEvent.ParticipantPermissionsChanged, (_before, p?: Participant) => {
    if (!p || p === room.localParticipant) publishIfAllowed();
  });
  publishIfAllowed();

  async function publishMic() {
    let c: MicChain;
    try {
      c = await openMic((e) => { if (room.state !== 'disconnected') sink.micFailed(e); });
    } catch (e) {
      // Refused or missing: said once, and not asked again in this call, however permissions change.
      micUnavailable = true;
      if (room.state !== 'disconnected') sink.micFailed(e);
      return;
    }
    if (gone()) return c.stop();
    chain = c;
    const track = new LocalAudioTrack(c.track, undefined, true);
    track.source = Track.Source.Microphone;
    mic = track;
    try {
      // Joining muted never sends a moment of audio: the track is muted before it is published.
      if (muted) await track.mute();
      // The cast only bridges the SDK's own types under exactOptionalPropertyTypes (`processor?`).
      await room.localParticipant.publishTrack(track as LocalTrack, { source: Track.Source.Microphone, dtx: true, red: true });
    } catch (e) {
      // Not published, as with permissions not yet updated: closed again, so a later change can try anew.
      if (mic === track) dropMic();
      if (!gone()) sink.micFailed(e);
    }
  }

  /** Whether the room has ended, read fresh each time: an await can change it. */
  function gone() {
    return room.state === 'disconnected';
  }

  /** Closes our microphone: the capture and its chain. */
  function dropMic() {
    mic?.stop();
    mic = null;
    chain?.stop();
    chain = null;
  }

  /** Stops our share, whichever way it ended, and says so once. */
  async function endShare() {
    const s = screen;
    screen = null;
    shareWanted = false;
    if (!s) return;
    for (const t of [s.video, s.audio]) {
      if (!t) continue;
      if (room.state !== 'disconnected') await room.localParticipant.unpublishTrack(t as LocalTrack).catch(() => {});
      t.stop();
    }
    sink.sharing(false);
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
    mic: () => chain,
    async setMuted(next) {
      muted = next;
      if (mic) await (next ? mic.mute() : mic.unmute());
    },
    setDeafened(next) {
      deafened = next;
      setReceiving(remotes(), !next);
    },
    setVolume(key, volume) {
      volumes.set(key, volume);
      const p = room.remoteParticipants.get(userOfVolumeKey(key));
      if (p) applyVolume(p);
    },
    setCanSpeak(on) {
      canSpeak = on;
      publishIfAllowed();
    },
    setMutedForMe(user, on) {
      if (on) mutedForMe.add(user);
      else mutedForMe.delete(user);
      const p = room.remoteParticipants.get(user);
      if (p) applyVolume(p);
    },
    async setCamera(on, limit) {
      cameraWanted = on;
      if (!on) {
        const track = camera;
        camera = null;
        if (track) await room.localParticipant.unpublishTrack(track as LocalTrack).catch(() => track.stop());
        return;
      }
      if (camera) return;
      const fit = fitTier(CAMERA, limit);
      if (!fit) throw new VideoLimitError();
      const device = loadVoiceSettings().cameraDevice;
      const track = await createLocalVideoTrack({ ...(device ? { deviceId: device } : {}), resolution: { ...fit, frameRate: CAMERA.frameRate } });
      try {
        await fitCapture(track.mediaStreamTrack, limit, CAMERA.frameRate);
        // Turned off, or the call ended, while the camera started.
        if (room.state === 'disconnected' || !cameraWanted || camera) throw new Superseded();
        camera = track;
        await room.localParticipant.publishTrack(track as LocalTrack, { source: Track.Source.Camera, simulcast: true });
      } catch (e) {
        if (camera === track) camera = null;
        track.stop();
        if (!(e instanceof Superseded)) throw e;
      }
    },
    async startShare(plan, audio, limit) {
      if (screen || shareWanted) return;
      shareWanted = true;
      let tracks: LocalTrack[];
      try {
        tracks = await room.localParticipant.createScreenTracks({
          // 0 x 0 asks for the source's own size, as the Text preset wants.
          resolution: plan.capture ? { ...plan.capture, frameRate: plan.fps } : { width: 0, height: 0 },
          contentHint: plan.hint,
          selfBrowserSurface: 'exclude',
          surfaceSwitching: 'include',
          ...(audio ? { audio: screenAudio(), systemAudio: 'include' as const } : {}),
        });
      } catch (e) {
        shareWanted = false;
        throw e;
      }
      const video = tracks.find((t) => t.kind === Track.Kind.Video) as LocalVideoTrack;
      const sound = (tracks.find((t) => t.kind === Track.Kind.Audio) as LocalAudioTrack | undefined) ?? null;
      try {
        const media = video.mediaStreamTrack;
        if (!plan.capture) await media.applyConstraints({ frameRate: { max: plan.fps } });
        await fitCapture(media, limit, plan.fps);
        if (room.state === 'disconnected' || !shareWanted) throw new Superseded();
        screen = { video, audio: sound };
        const { width = 0, height = 1 } = media.getSettings();
        const layers = plan.layers.map((l) => new VideoPreset(Math.round((l.height * width) / height / 2) * 2, l.height, l.bitrate, l.fps, 'high'));
        await room.localParticipant.publishTrack(video as LocalTrack, {
          source: Track.Source.ScreenShare,
          videoCodec: plan.codec,
          backupCodec: plan.backup ? { codec: 'vp8' } : false,
          degradationPreference: plan.degradation,
          screenShareEncoding: { maxBitrate: plan.bitrate, maxFramerate: plan.fps, priority: 'high' },
          simulcast: layers.length > 0,
          ...(layers.length ? { screenShareSimulcastLayers: layers } : {}),
        });
        if (sound && screen?.audio === sound) {
          await room.localParticipant.publishTrack(sound as LocalTrack, { source: Track.Source.ScreenShareAudio, dtx: false, red: false, forceStereo: true });
        }
        if (screen?.video === video) sink.sharing(true);
      } catch (e) {
        if (screen?.video === video) await endShare();
        else for (const t of tracks) t.stop();
        shareWanted = false;
        if (!(e instanceof Superseded)) throw e;
      }
    },
    async stopShare() {
      shareWanted = false;
      await endShare();
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

/** A camera or share that was turned off, or whose call ended, before it started. Not an error to show. */
class Superseded extends Error {}
