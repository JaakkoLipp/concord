/**
 * Voice sounds (client.md section 10.2, m4-plan.md decision 10): short tones generated with Web Audio, so
 * there are no files to license. Proper sounds can come in M7's polish. They play through the chosen speaker,
 * where the browser can choose one, at the chosen output volume (m4.5-plan.md task 8).
 */
import { loadVoiceSettings, onVoiceSettings } from './settings.ts';

export type Sound = 'join' | 'leave' | 'mute' | 'unmute' | 'deafen' | 'undeafen' | 'peerJoin' | 'peerLeave';

/** Each sound is a few notes: frequency in Hz, start and length in seconds. */
type Note = [hz: number, at: number, length: number];

const SOUNDS: Record<Sound, Note[]> = {
  join: [[523, 0, 0.09], [784, 0.09, 0.14]],
  leave: [[784, 0, 0.09], [523, 0.09, 0.14]],
  mute: [[660, 0, 0.06], [440, 0.06, 0.08]],
  unmute: [[440, 0, 0.06], [660, 0.06, 0.08]],
  deafen: [[440, 0, 0.07], [330, 0.07, 0.07], [262, 0.14, 0.1]],
  undeafen: [[262, 0, 0.07], [330, 0.07, 0.07], [440, 0.14, 0.1]],
  peerJoin: [[587, 0, 0.08], [880, 0.08, 0.12]],
  peerLeave: [[880, 0, 0.08], [587, 0.08, 0.12]],
};
/** The ring: two short bursts, repeated every 2 s. */
const RING: Note[] = [[880, 0, 0.18], [660, 0.22, 0.18], [880, 0.5, 0.18], [660, 0.72, 0.18]];
const RING_EVERY_MS = 2_000;
const LEVEL = 0.12;

let context: AudioContext | null = null;
/** The speaker the context plays to, as last set: '' for the system default. */
let sink = '';

/** Chromium's AudioContext can play to a chosen speaker; elsewhere sounds use the default. */
type SinkContext = AudioContext & { setSinkId?: (id: string) => Promise<void> };
function useSpeaker(ctx: SinkContext, device: string): void {
  if (device === sink || !ctx.setSinkId) return;
  sink = device;
  void ctx.setSinkId(device).catch(() => (sink = ''));
}

function audio(): AudioContext | null {
  try {
    if (!context) {
      context = new AudioContext();
      onVoiceSettings((s) => { if (context) useSpeaker(context, s.outputDevice); });
    }
    useSpeaker(context, loadVoiceSettings().outputDevice);
    if (context.state === 'suspended') void context.resume();
    return context;
  } catch {
    return null;
  }
}

/** The tones' level, scaled by the output volume. */
const level = () => LEVEL * (loadVoiceSettings().outputVolume / 100);

function playNotes(notes: Note[]): void {
  const ctx = audio();
  if (!ctx) return;
  const start = ctx.currentTime + 0.01;
  const peak = level();
  if (peak <= 0) return;
  for (const [hz, at, length] of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = hz;
    // A quick attack and an exponential fade, so the tones don't click.
    gain.gain.setValueAtTime(0.0001, start + at);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), start + at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + at + length);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start + at);
    osc.stop(start + at + length + 0.02);
  }
}

export function play(sound: Sound): void {
  playNotes(SOUNDS[sound]);
}

/** Loop the ring tone until the returned function is called (DM calls, client.md section 10.8). */
export function ring(): () => void {
  playNotes(RING);
  const timer = setInterval(() => playNotes(RING), RING_EVERY_MS);
  return () => clearInterval(timer);
}
