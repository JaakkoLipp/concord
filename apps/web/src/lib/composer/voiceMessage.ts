/**
 * Voice messages (M4.8 task 14c): recorded from the microphone chosen in Voice and video settings, and sent as an
 * ordinary audio file named `voice-message-<time>.<ext>`. Autumn classes an audio-only WebM (Chromium's recording)
 * as a plain file and Ogg (Firefox's) as audio, and gives neither a duration (m4.8-results.md probe 7), so the name
 * is what marks a voice message for the player.
 */
import { loadVoiceSettings } from '$lib/voice/settings.ts';

const NAME = /^voice-message-[0-9T-]+\.(ogg|opus|webm|m4a|mp4)$/i;
/** Whether an attachment is a voice message, by its name. */
export const isVoiceMessage = (filename: string) => NAME.test(filename);

/** Ogg first where the browser makes it, since Autumn then calls it audio; then WebM; Safari's MP4 last. */
const FORMATS = [
  { mime: 'audio/ogg;codecs=opus', ext: 'ogg' },
  { mime: 'audio/webm;codecs=opus', ext: 'webm' },
  { mime: 'audio/mp4', ext: 'm4a' },
] as const;

export function voiceFormat(): (typeof FORMATS)[number] | null {
  if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) return null;
  return FORMATS.find((f) => MediaRecorder.isTypeSupported(f.mime)) ?? null;
}

/** `voice-message-20261018-142233.ogg`, in local time. */
export function voiceFileName(at: Date, ext: string): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `voice-message-${at.getFullYear()}${p(at.getMonth() + 1)}${p(at.getDate())}-${p(at.getHours())}${p(at.getMinutes())}${p(at.getSeconds())}.${ext}`;
}

/** The longest recording; it stops by itself there. */
export const VOICE_MAX_MS = 10 * 60_000;

export interface VoiceRecording {
  readonly started: number;
  /** Stops and gives the clip as a file, or null if nothing was recorded. */
  stop(): Promise<File | null>;
  /** Stops and throws the clip away. */
  cancel(): void;
}

async function microphone(): Promise<MediaStream> {
  const s = loadVoiceSettings();
  const audio = { echoCancellation: s.echoCancellation, noiseSuppression: true, autoGainControl: s.autoGainControl };
  if (s.inputDevice) {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: { ...audio, deviceId: { exact: s.inputDevice } } });
    } catch (e) {
      // A device that is gone falls back to the default; a refusal is final.
      if (e instanceof DOMException && e.name === 'NotAllowedError') throw e;
    }
  }
  return navigator.mediaDevices.getUserMedia({ audio });
}

/** Starts recording. Rejects with the browser's error when the microphone is refused or missing. */
export async function startVoiceRecording(): Promise<VoiceRecording> {
  const format = voiceFormat();
  if (!format) throw new Error('recording is not supported here');
  const stream = await microphone();
  const release = () => stream.getTracks().forEach((t) => t.stop());
  const chunks: Blob[] = [];
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType: format.mime, audioBitsPerSecond: 48_000 });
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.start(1000);
  } catch (e) {
    release();
    throw e;
  }
  const started = Date.now();
  return {
    started,
    stop: () => new Promise((resolve) => {
      if (recorder.state === 'inactive') {
        release();
        return resolve(null);
      }
      recorder.onstop = () => {
        release();
        const type = format.mime.split(';')[0]!;
        resolve(chunks.length ? new File(chunks, voiceFileName(new Date(started), format.ext), { type }) : null);
      };
      recorder.stop();
    }),
    cancel: () => {
      recorder.onstop = release;
      if (recorder.state !== 'inactive') recorder.stop();
      else release();
    },
  };
}
