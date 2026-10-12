/**
 * M0 screen-share test page (docs/dev-environment.md section 7). Throwaway: it measures encoders, sharer CPU
 * and layer behaviour against the VPS's LiveKit, and is deleted after M3.
 */
import {
  LocalVideoTrack, Room, RoomEvent, Track, VideoPreset, VideoQuality,
  type RemoteTrack, type RemoteTrackPublication, type RemoteParticipant, type TrackPublishOptions, type VideoCodec,
} from 'livekit-client';
import { version as livekitVersion } from 'livekit-client';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const log = (msg: string, error = false) => {
  const line = document.createElement('div');
  line.textContent = `${new Date().toLocaleTimeString()} ${msg}`;
  if (error) line.className = 'err';
  $('log').prepend(line);
};

// Stoat's video limit is an area: width times height must stay within 2560x1440 (Revolt.toml video_resolution).
const MAX_AREA = 2560 * 1440;
let session = sessionStorage.getItem('spike-session') ?? '';
let room: Room | null = null;
let screen: LocalVideoTrack | null = null;
const history: Record<string, unknown>[] = [];

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { ...(session ? { 'x-session-token': session } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : null,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text}`);
  return (text ? JSON.parse(text) : null) as T;
}

// ---- 1. Login ----

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target as HTMLFormElement);
  try {
    let res = await api<{ result: string; token?: string; ticket?: string }>('POST', '/auth/session/login', {
      email: f.get('email'), password: f.get('password'), friendly_name: 'M0 screen-share test',
    });
    if (res.result === 'MFA') {
      const code = String(f.get('totp') ?? '').trim();
      if (!code) throw new Error('This account has TOTP: enter the code and log in again.');
      res = await api('POST', '/auth/session/login', { mfa_ticket: res.ticket, mfa_response: { totp_code: code }, friendly_name: 'M0 screen-share test' });
    }
    if (res.result !== 'Success' || !res.token) throw new Error(`login: ${res.result}`);
    session = res.token;
    sessionStorage.setItem('spike-session', session);
    await loadChannels();
  } catch (err) {
    log(String(err), true);
  }
});

interface Channel { _id: string; name?: string; channel_type: string; server?: string; voice?: unknown }

/** Voice channels come from the socket's Ready, the only place that lists everything the user can see. */
function loadChannels(): Promise<void> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${location.origin.replace(/^http/, 'ws')}/ws?version=1&format=json`);
    ws.onopen = () => ws.send(JSON.stringify({ type: 'Authenticate', token: session }));
    ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data)) as { type: string; error?: string; channels?: Channel[]; servers?: { _id: string; name: string }[] };
      if (msg.type === 'Error') {
        sessionStorage.removeItem('spike-session');
        session = '';
        ws.close();
        reject(new Error(`socket: ${msg.error ?? 'error'}; log in again`));
        return;
      }
      if (msg.type !== 'Ready') return;
      ws.close();
      const servers = new Map((msg.servers ?? []).map((s) => [s._id, s.name]));
      const voice = (msg.channels ?? []).filter((c) => c.channel_type === 'VoiceChannel' || c.voice !== undefined);
      const select = $<HTMLSelectElement>('channel');
      select.replaceChildren(...voice.map((c) => new Option(`${servers.get(c.server ?? '') ?? 'DM'} / ${c.name ?? c._id}`, c._id)));
      $('login').hidden = true;
      $('setup').hidden = false;
      log(`logged in; ${voice.length} voice channels`);
      resolve();
    };
    ws.onerror = () => reject(new Error('socket error'));
    ws.onclose = () => reject(new Error('socket closed before Ready'));
  });
}

// ---- 2. Join ----

$('join').addEventListener('click', async () => {
  try {
    const root = await api<{ features: { livekit?: { enabled: boolean; nodes: { name: string }[] } } }>('GET', '/');
    const node = root.features.livekit?.nodes[0]?.name;
    if (!node) throw new Error('no LiveKit node in GET /api/');
    const channel = $<HTMLSelectElement>('channel').value;
    const { token } = await api<{ token: string; url: string }>('POST', `/channels/${channel}/join_call`, { node, force_disconnect: true });
    // The token lasts about 10 seconds, so connect immediately. Same origin, never the absolute URL Stoat returns.
    room = new Room({ adaptiveStream: true, dynacast: true });
    room.on(RoomEvent.TrackSubscribed, onSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, (_t, pub, p) => document.getElementById(tileId(p.identity, pub.trackSid))?.remove());
    room.on(RoomEvent.Disconnected, (reason) => { log(`disconnected: ${reason}`); setJoined(false); });
    room.on(RoomEvent.ParticipantConnected, (p) => log(`joined: ${p.identity}`));
    room.on(RoomEvent.ParticipantDisconnected, (p) => log(`left: ${p.identity}`));
    const relay = $<HTMLSelectElement>('relay').value === 'yes';
    await room.connect(`${location.origin.replace(/^http/, 'ws')}/livekit`, token, {
      autoSubscribe: true,
      ...(relay ? { rtcConfig: { iceTransportPolicy: 'relay' } } : {}),
    });
    log(`connected to ${node} as ${room.localParticipant.identity}${relay ? ' (relay only)' : ''}`);
    setJoined(true);
  } catch (err) {
    log(String(err), true);
  }
});

$('leave').addEventListener('click', async () => {
  await stopShare();
  await room?.disconnect();
});

function setJoined(joined: boolean) {
  $<HTMLButtonElement>('join').disabled = joined;
  $<HTMLButtonElement>('share').disabled = !joined;
  $<HTMLButtonElement>('leave').disabled = !joined;
  $<HTMLButtonElement>('copy').disabled = !joined;
  if (!joined) $('tiles').replaceChildren();
}

// ---- 3. Share ----

$('share').addEventListener('click', async () => {
  if (!room) return;
  try {
    const [w, h, fps] = /(\d+)x(\d+)@(\d+)/.exec($<HTMLSelectElement>('capture').value)!.slice(1).map(Number) as [number, number, number];
    const codec = $<HTMLSelectElement>('codec').value as VideoCodec;
    const mbps = Number($<HTMLSelectElement>('bitrate').value);
    const layered = $<HTMLSelectElement>('layers').value === 'layered';
    const hint = $<HTMLSelectElement>('hint').value;
    const degradation = $<HTMLSelectElement>('degradation').value as RTCDegradationPreference;

    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { width: { ideal: w }, height: { ideal: h }, frameRate: { ideal: fps, max: fps } },
      audio: false,
    });
    const media = stream.getVideoTracks()[0]!;
    media.contentHint = hint;
    // Clamp the declared size to Stoat's area limit, keeping the aspect ratio.
    const s = media.getSettings();
    if ((s.width ?? 0) * (s.height ?? 0) > MAX_AREA) {
      const scale = Math.sqrt(MAX_AREA / (s.width! * s.height!));
      await media.applyConstraints({ width: Math.floor(s.width! * scale), height: Math.floor(s.height! * scale), frameRate: fps });
      log(`clamped capture from ${s.width}x${s.height}`);
    }
    screen = new LocalVideoTrack(media, undefined, false);
    screen.source = Track.Source.ScreenShare;
    media.addEventListener('ended', () => void stopShare());

    const svc = codec === 'vp9' || codec === 'av1';
    const options: TrackPublishOptions = {
      source: Track.Source.ScreenShare,
      videoCodec: codec,
      backupCodec: false,
      degradationPreference: degradation,
      videoEncoding: { maxBitrate: mbps * 1_000_000, maxFramerate: fps, priority: 'high' },
      simulcast: layered && !svc,
      ...(layered && !svc ? { screenShareSimulcastLayers: [new VideoPreset(1280, 720, 2_500_000, 30), new VideoPreset(640, 360, 600_000, 15)] } : {}),
      ...(svc ? { scalabilityMode: layered ? 'L3T3_KEY' : 'L1T3' } : {}),
    };
    await room.localParticipant.publishTrack(screen, options);
    const settings = { capture: `${w}x${h}@${fps}`, codec, mbps, layered, hint, degradation, relay: $<HTMLSelectElement>('relay').value };
    history.push({ event: 'publish', at: new Date().toISOString(), settings, actual: media.getSettings() });
    log(`sharing ${JSON.stringify(settings)}`);
    addTile('local', 'You (sharing)', screen.attach() as HTMLVideoElement);
    $<HTMLButtonElement>('share').disabled = true;
    $<HTMLButtonElement>('stop').disabled = false;
  } catch (err) {
    log(String(err), true);
  }
});

$('stop').addEventListener('click', () => void stopShare());

async function stopShare() {
  if (!screen) return;
  await room?.localParticipant.unpublishTrack(screen);
  screen.stop();
  screen = null;
  document.getElementById('local')?.remove();
  $<HTMLButtonElement>('share').disabled = !room;
  $<HTMLButtonElement>('stop').disabled = true;
}

// ---- 4. Viewing ----

const tileId = (identity: string, sid: string) => `remote-${identity}-${sid}`;

function onSubscribed(track: RemoteTrack, pub: RemoteTrackPublication, p: RemoteParticipant) {
  if (track.kind !== Track.Kind.Video) return;
  const id = tileId(p.identity, pub.trackSid);
  const tile = addTile(id, p.name || p.identity, track.attach() as HTMLVideoElement);
  const select = document.createElement('select');
  select.append(new Option('auto layer', 'auto'), new Option('high', 'high'), new Option('medium', 'medium'), new Option('low', 'low'));
  select.onchange = () => {
    if (select.value === 'auto') pub.setVideoQuality(VideoQuality.HIGH);
    else pub.setVideoQuality({ high: VideoQuality.HIGH, medium: VideoQuality.MEDIUM, low: VideoQuality.LOW }[select.value as 'high']);
  };
  tile.prepend(select);
}

function addTile(id: string, title: string, video: HTMLVideoElement): HTMLElement {
  document.getElementById(id)?.remove();
  const tile = document.createElement('div');
  tile.className = 'tile';
  tile.id = id;
  video.muted = true;
  video.playsInline = true;
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.dataset.title = title;
  meta.textContent = title;
  tile.append(video, meta);
  $('tiles').append(tile);
  return tile;
}

// ---- 5. Statistics, every second ----

const previous = new Map<string, { bytes: number; at: number }>();
let pressure = 'unknown';

function bitrate(key: string, bytes: number, at: number): number {
  const prev = previous.get(key);
  previous.set(key, { bytes, at });
  return prev && at > prev.at ? ((bytes - prev.bytes) * 8) / ((at - prev.at) / 1000) / 1e6 : 0;
}

async function connectionType(pc: RTCStatsReport): Promise<string> {
  let pairId = '';
  pc.forEach((s) => { if (s.type === 'transport' && s.selectedCandidatePairId) pairId = s.selectedCandidatePairId; });
  let local = '';
  pc.forEach((s) => { if (s.type === 'candidate-pair' && (s.id === pairId || (!pairId && s.nominated && s.state === 'succeeded'))) local = s.localCandidateId; });
  let out = '?';
  pc.forEach((s) => { if (s.id === local) out = `${s.candidateType} ${s.protocol}${s.relayProtocol ? ` via ${s.relayProtocol}` : ''}`; });
  return out;
}

async function senderStats(): Promise<Record<string, unknown> | null> {
  const sender = screen?.sender;
  if (!sender) return null;
  const report = await sender.getStats();
  const layers: Record<string, unknown>[] = [];
  const codecs = new Map<string, string>();
  report.forEach((s) => { if (s.type === 'codec') codecs.set(s.id, s.mimeType); });
  report.forEach((s) => {
    if (s.type !== 'outbound-rtp' || s.kind !== 'video') return;
    layers.push({
      rid: s.rid ?? s.scalabilityMode ?? '-', size: `${s.frameWidth ?? 0}x${s.frameHeight ?? 0}`, fps: s.framesPerSecond ?? 0,
      mbps: +bitrate(`out-${s.ssrc}`, s.bytesSent, s.timestamp).toFixed(2), encoder: s.encoderImplementation,
      hardware: s.powerEfficientEncoder, limit: s.qualityLimitationReason, codec: codecs.get(s.codecId), active: s.active,
    });
  });
  return { layers, connection: await connectionType(report), pressure };
}

async function receiverStats(track: RemoteTrack): Promise<Record<string, unknown> | null> {
  const receiver = track.receiver;
  if (!receiver) return null;
  const report = await receiver.getStats();
  let out: Record<string, unknown> | null = null;
  const codecs = new Map<string, string>();
  report.forEach((s) => { if (s.type === 'codec') codecs.set(s.id, s.mimeType); });
  report.forEach((s) => {
    if (s.type !== 'inbound-rtp' || s.kind !== 'video') return;
    out = {
      size: `${s.frameWidth ?? 0}x${s.frameHeight ?? 0}`, fps: s.framesPerSecond ?? 0,
      mbps: +bitrate(`in-${s.ssrc}`, s.bytesReceived, s.timestamp).toFixed(2), dropped: s.framesDropped, decoder: s.decoderImplementation,
      hardware: s.powerEfficientDecoder, codec: codecs.get(s.codecId), freezes: s.freezeCount,
    };
  });
  if (out) (out as Record<string, unknown>).connection = await connectionType(report);
  return out;
}

const fmt = (o: Record<string, unknown> | null) => (o ? JSON.stringify(o, null, 1).replace(/[{}"]/g, '').replace(/\n\s*\n/g, '\n').trim() : 'no stats yet');

setInterval(async () => {
  if (!room) return;
  const sample: Record<string, unknown> = { at: new Date().toISOString() };
  const local = document.querySelector<HTMLElement>('#local .meta');
  if (local) {
    const s = await senderStats();
    sample.sender = s;
    local.textContent = `${local.dataset.title}\n${fmt(s)}`;
  }
  const viewers: Record<string, unknown> = {};
  for (const p of room.remoteParticipants.values()) {
    for (const pub of p.videoTrackPublications.values()) {
      if (!pub.track) continue;
      const meta = document.querySelector<HTMLElement>(`#${CSS.escape(tileId(p.identity, pub.trackSid))} .meta`);
      const s = await receiverStats(pub.track);
      if (s) s.layer = `${pub.dimensions?.width ?? '?'}x${pub.dimensions?.height ?? '?'} published, quality ${VideoQuality[pub.videoQuality ?? VideoQuality.HIGH]}`;
      viewers[p.identity] = s;
      if (meta) meta.textContent = `${meta.dataset.title}\n${fmt(s)}`;
    }
  }
  if (Object.keys(viewers).length) sample.viewers = viewers;
  if (sample.sender || sample.viewers) history.push(sample);
  if (history.length > 600) history.splice(1, history.length - 600);
}, 1000);

// Chrome's Compute Pressure API, a rough stand-in for sharer CPU. Task Manager stays the real measure.
if ('PressureObserver' in window) {
  const Observer = (window as unknown as { PressureObserver: new (cb: (r: { state: string }[]) => void) => { observe(s: string): Promise<void> } }).PressureObserver;
  new Observer((records) => { pressure = records.at(-1)?.state ?? pressure; }).observe('cpu').catch(() => {});
}

// ---- 6. Results ----

$('copy').addEventListener('click', async () => {
  const report = {
    page: 'm0-screenshare', livekitClient: livekitVersion, userAgent: navigator.userAgent, cores: navigator.hardwareConcurrency,
    sendCodecs: RTCRtpSender.getCapabilities('video')?.codecs.map((c) => `${c.mimeType} ${c.sdpFmtpLine ?? ''}`.trim()),
    samples: history,
  };
  await navigator.clipboard.writeText(JSON.stringify(report, null, 1));
  log(`copied ${history.length} samples`);
});

$('caps').textContent = `livekit-client ${livekitVersion}. This browser can send: ${[...new Set(RTCRtpSender.getCapabilities('video')?.codecs.map((c) => c.mimeType.replace('video/', '')).filter((c) => !/rtx|red|ulpfec|flexfec/i.test(c)))].join(', ')}`;

if (session) loadChannels().catch((err) => { log(String(err), true); });
