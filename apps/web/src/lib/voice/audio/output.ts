/**
 * Devices and output (client.md section 10.5): what the browser can list and choose, and how loud it can
 * play. Light enough for the settings section to load without the microphone chain.
 */

/** The browser's devices of one kind. Labels are empty until the user has allowed a microphone or camera. */
export async function listDevices(kind: MediaDeviceKind): Promise<MediaDeviceInfo[]> {
  try {
    return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === kind);
  } catch {
    return [];
  }
}

/** Every WebKit browser, which livekit-client won't switch outputs in. */
function webkit(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Safari\//.test(ua) && !/Chrome\/|Chromium\/|Android/.test(ua));
}

/** Whether a speaker can be chosen: Chromium and Firefox, not Safari, so the setting is hidden there. */
export function outputSelectable(): boolean {
  return typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype && !webkit();
}

/**
 * Whether Web Audio can play to a chosen speaker, which only Chromium can. Volumes above 100 % need Web Audio
 * mixing, so this decides the volume cap too.
 */
export function webAudioOutput(): boolean {
  return typeof AudioContext !== 'undefined' && 'setSinkId' in AudioContext.prototype;
}

/** The highest output and per-user volume in percent: 200 in Chromium, 100 elsewhere. */
export function maxOutputVolume(): number {
  return webAudioOutput() ? 200 : 100;
}

export interface Playback {
  /** Percent, capped at maxOutputVolume(). */
  setVolume(percent: number): void;
  /** '' for the system default. */
  setDevice(deviceId: string): Promise<void>;
  stop(): void;
}

type SinkContext = AudioContext & { setSinkId(id: string): Promise<void> };
type SinkElement = HTMLAudioElement & { setSinkId(id: string): Promise<void> };

/**
 * Plays a local track, for the mic test: through Web Audio in Chromium, so it can go above 100 %, and
 * through an audio element elsewhere.
 */
export async function playTrack(track: MediaStreamTrack, deviceId: string, percent: number): Promise<Playback> {
  const stream = new MediaStream([track]);
  const volume = (p: number) => Math.min(maxOutputVolume(), Math.max(0, p)) / 100;
  if (webAudioOutput()) {
    const ctx = new AudioContext({ latencyHint: 'interactive' }) as SinkContext;
    const gain = new GainNode(ctx, { gain: volume(percent) });
    ctx.createMediaStreamSource(stream).connect(gain).connect(ctx.destination);
    const setDevice = async (id: string) => { await ctx.setSinkId(id).catch(() => undefined); };
    if (deviceId) await setDevice(deviceId);
    await ctx.resume().catch(() => undefined);
    return {
      setVolume: (p) => gain.gain.setTargetAtTime(volume(p), ctx.currentTime, 0.02),
      setDevice,
      stop: () => void ctx.close().catch(() => undefined),
    };
  }
  const audio = new Audio() as SinkElement;
  audio.srcObject = stream;
  audio.volume = volume(percent);
  const setDevice = async (id: string) => {
    if (outputSelectable()) await audio.setSinkId(id).catch(() => undefined);
  };
  if (deviceId) await setDevice(deviceId);
  await audio.play().catch(() => undefined);
  return {
    setVolume: (p) => { audio.volume = volume(p); },
    setDevice,
    stop: () => { audio.pause(); audio.srcObject = null; },
  };
}
