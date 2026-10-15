/**
 * A fake microphone for the voice checks. Chromium's own fake device beeps in short pulses, which noise
 * suppression, echo cancellation and gain control learn to remove within seconds, and which LiveKit's speaking
 * detection rarely counts as speech. This writes a speech-like WAV instead: syllable-length bursts of a harmonic
 * tone at changing pitch, with gaps, that Chromium plays on a loop (`--use-file-for-fake-audio-capture`).
 */
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const RATE = 48_000;

function voiceWav(seconds = 12): Buffer {
  const n = RATE * seconds;
  const data = Buffer.alloc(n * 2);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    // 450 ms bursts every 600 ms, each at its own pitch between 110 and 230 Hz, with a soft attack and release.
    const syllable = Math.floor(t / 0.6);
    const at = t - syllable * 0.6;
    const pitch = 110 + ((syllable * 37) % 120);
    const env = at < 0.45 ? Math.min(1, at / 0.03, (0.45 - at) / 0.05) : 0;
    phase += (2 * Math.PI * pitch) / RATE;
    let v = 0;
    for (let h = 1; h <= 6; h++) v += Math.sin(phase * h) / h;
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v * env * 0.35)) * 32767), i * 2);
  }
  const head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVE', 8);
  head.write('fmt ', 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
  head.writeUInt32LE(RATE, 24); head.writeUInt32LE(RATE * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
  head.write('data', 36); head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

/** Chromium flags for a fake camera and the speech-like fake microphone. */
export function fakeMediaArgs(): string[] {
  const file = join(tmpdir(), 'concord-fake-voice.wav');
  writeFileSync(file, voiceWav());
  return ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${file}`];
}
