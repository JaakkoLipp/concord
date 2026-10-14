/**
 * The microphone chain (client.md section 10.4), in our own 48 kHz AudioContext:
 * getUserMedia → mono junction → RNNoise or bypass → input volume → gate worklet → MediaStreamDestination.
 * The destination's track is what the voice controller publishes. It stays the same track for the chain's
 * life: a device or processing change replaces only the source behind it.
 */
import { RnnoiseWorkletNode, loadRnnoise } from '@sapphi-red/web-noise-suppressor';
// Emitted as files under /app/_app, never inlined: CSP's script-src 'self' blocks a data: worklet.
import rnnoiseWorkletUrl from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url&no-inline';
import rnnoiseWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url&no-inline';
import rnnoiseSimdUrl from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url&no-inline';
import gateWorkletUrl from './gate.worklet.ts?worker&url';
import type { VoiceSettings } from '../settings.ts';
import { GATE_PROCESSOR, SILENCE_DB, type GateConfig, type GateMessage, type GateReport } from './gate.ts';

export interface MicChain {
  /** The processed microphone, for publishTrack. The same track until stop(). */
  track: MediaStreamTrack;
  /** The level in dBFS after input volume and before the gate, for meters. */
  level(): number;
  /** Whether the gate lets sound through now. */
  gateOpen(): boolean;
  /** Applies new settings, rebuilding only the nodes they affect. A device change keeps the same track. */
  update(settings: VoiceSettings): Promise<void>;
  /** The push-to-talk key went down or up. The chain closes the gate itself when the window loses focus. */
  setPushToTalk(down: boolean): void;
  /** Releases the microphone and the audio context. */
  stop(): void;
}

// Fetched once per page, on the first chain that wants RNNoise.
let wasm: Promise<ArrayBuffer> | undefined;
const rnnoiseWasm = () => (wasm ??= loadRnnoise({ url: rnnoiseWasmUrl, simdUrl: rnnoiseSimdUrl }).catch((e: unknown) => {
  wasm = undefined;
  throw e;
}));

const gateConfig = (s: VoiceSettings): GateConfig => ({ mode: s.inputMode, auto: s.autoSensitivity, threshold: s.threshold });

/** The browser's own noise suppression and voice isolation are off while RNNoise does the job. */
function constraints(s: VoiceSettings): MediaTrackConstraints {
  const browserSuppression = s.noiseSuppression !== 'rnnoise';
  const c: MediaTrackConstraints & { voiceIsolation?: boolean } = {
    channelCount: { ideal: 1 },
    sampleRate: { ideal: 48000 },
    echoCancellation: s.echoCancellation,
    autoGainControl: s.autoGainControl,
    noiseSuppression: browserSuppression,
    voiceIsolation: browserSuppression,
  };
  // Ideal rather than exact: an unplugged device falls back to another instead of failing.
  if (s.inputDevice) c.deviceId = { ideal: s.inputDevice };
  return c;
}

/** A setting that is a getUserMedia constraint, so changing it means opening the microphone again. */
const sourceChanged = (a: VoiceSettings, b: VoiceSettings) =>
  a.inputDevice !== b.inputDevice || a.echoCancellation !== b.echoCancellation
  || a.autoGainControl !== b.autoGainControl || a.noiseSuppression !== b.noiseSuppression;

/**
 * RNNoise needs 48 kHz. Firefox may refuse a microphone at another rate in a 48 kHz context, and then the
 * chain runs at the browser's own rate rather than not at all.
 */
function openContext(stream: MediaStream): { ctx: AudioContext; source: MediaStreamAudioSourceNode } {
  const ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
  try {
    return { ctx, source: ctx.createMediaStreamSource(stream) };
  } catch {
    void ctx.close();
    const fallback = new AudioContext({ latencyHint: 'interactive' });
    return { ctx: fallback, source: fallback.createMediaStreamSource(stream) };
  }
}

/** Must start from a user gesture, such as the join click, or the context stays suspended. */
export async function createMicChain(settings: VoiceSettings): Promise<MicChain> {
  let current = { ...settings };
  let stream = await navigator.mediaDevices.getUserMedia({ audio: constraints(current) });
  let ctx: AudioContext;
  let source: MediaStreamAudioSourceNode;
  try {
    ({ ctx, source } = openContext(stream));
    await Promise.all([ctx.audioWorklet.addModule(gateWorkletUrl), ctx.audioWorklet.addModule(rnnoiseWorkletUrl)]);
  } catch (e) {
    for (const t of stream.getTracks()) t.stop();
    throw e;
  }

  const mono = { channelCount: 1, channelCountMode: 'explicit', channelInterpretation: 'speakers' } as const;
  const junction = new GainNode(ctx, mono);
  const gain = new GainNode(ctx, { ...mono, gain: current.inputVolume / 100 });
  const gate = new AudioWorkletNode(ctx, GATE_PROCESSOR, {
    ...mono, numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], processorOptions: gateConfig(current),
  });
  const destination = new MediaStreamAudioDestinationNode(ctx, mono);
  let rnnoise: RnnoiseWorkletNode | null = null;
  gain.connect(gate).connect(destination);
  source.connect(junction);

  let level = SILENCE_DB;
  let open = false;
  let stopped = false;
  gate.port.onmessage = (e: MessageEvent<GateReport>) => {
    level = e.data.level;
    open = e.data.open;
  };
  const post = (msg: GateMessage) => gate.port.postMessage(msg);
  // Changes apply one at a time, in order, so a quick series can't interleave.
  let queue = Promise.resolve();

  /** RNNoise in or out, between the junction and the input volume. */
  async function setRnnoise(want: boolean): Promise<void> {
    // At another rate (the Firefox fallback above) RNNoise would distort the voice: bypass it.
    const on = want && ctx.sampleRate === 48000;
    const next = on ?new RnnoiseWorkletNode(ctx, { maxChannels: 1, wasmBinary: await rnnoiseWasm() }) : null;
    if (stopped) { next?.destroy(); return; }
    junction.disconnect();
    if (next) junction.connect(next).connect(gain);
    else junction.connect(gain);
    if (rnnoise) { rnnoise.disconnect(); rnnoise.destroy(); }
    rnnoise = next;
  }

  /** Opens the microphone again with the current settings, behind the same junction and output track. */
  async function replaceSource(): Promise<void> {
    source.disconnect();
    for (const t of stream.getTracks()) t.stop();
    stream = await navigator.mediaDevices.getUserMedia({ audio: constraints(current) });
    if (stopped) { for (const t of stream.getTracks()) t.stop(); return; }
    source = ctx.createMediaStreamSource(stream);
    source.connect(junction);
    watchEnded();
  }

  // An unplugged microphone ends its track: open whichever is there now.
  function watchEnded(): void {
    const mic = stream.getAudioTracks()[0];
    if (mic) mic.onended = () => { if (!stopped) queue = queue.then(replaceSource).catch(() => undefined); };
  }
  watchEnded();

  // Keys can't be seen without focus, so push-to-talk closes when the window loses it.
  const blur = () => post({ type: 'blur' });
  const hidden = () => { if (document.visibilityState === 'hidden') blur(); };
  window.addEventListener('blur', blur);
  document.addEventListener('visibilitychange', hidden);

  try {
    await setRnnoise(current.noiseSuppression === 'rnnoise');
  } catch {
    // RNNoise failed to load: the chain still works, unsuppressed, rather than leaving the user mute.
    junction.connect(gain);
  }
  await ctx.resume().catch(() => undefined);

  async function apply(next: VoiceSettings): Promise<void> {
    if (stopped) return;
    const before = current;
    current = { ...next };
    void ctx.resume().catch(() => undefined);
    if (before.inputVolume !== next.inputVolume) gain.gain.setTargetAtTime(next.inputVolume / 100, ctx.currentTime, 0.02);
    post({ type: 'config', config: gateConfig(next) });
    if (before.noiseSuppression !== next.noiseSuppression) await setRnnoise(next.noiseSuppression === 'rnnoise');
    if (sourceChanged(before, next)) await replaceSource();
  }

  return {
    track: destination.stream.getAudioTracks()[0]!,
    level: () => level,
    gateOpen: () => open,
    update(next) {
      const run = queue.then(() => apply(next));
      queue = run.catch(() => undefined);
      return run;
    },
    setPushToTalk: (down) => post({ type: 'ptt', down }),
    stop() {
      if (stopped) return;
      stopped = true;
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', hidden);
      for (const t of stream.getTracks()) { t.onended = null; t.stop(); }
      post({ type: 'stop' });
      rnnoise?.destroy();
      for (const t of destination.stream.getTracks()) t.stop();
      void ctx.close().catch(() => undefined);
    },
  };
}
