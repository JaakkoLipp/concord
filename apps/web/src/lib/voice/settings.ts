/**
 * Voice and video settings, kept on this device only (m4-plan.md decision 6, client.md section 10.9), with
 * per-user volumes in the same store. Plain TypeScript: the settings section holds its own state, and the
 * voice controller listens for changes to update a running call.
 */
const KEY = 'concord:voice';

export type InputMode = 'voice' | 'ptt';
export type SharePreset = '1080p60' | '1080p30' | '720p30' | 'text';
/** A push-to-talk key: `code` matches key events whatever the layout, `label` is what the user pressed. */
export interface PushToTalkKey { code: string; label: string }

export interface VoiceSettings {
  /** Device IDs, '' for the system default. */
  inputDevice: string;
  outputDevice: string;
  cameraDevice: string;
  /** Percent: 0 to 200. Output above 100 only where the browser can boost it (audio/output.ts). */
  inputVolume: number;
  outputVolume: number;
  inputMode: InputMode;
  pushToTalkKey: PushToTalkKey | null;
  /** Voice activity: the threshold follows the noise floor, or is `threshold` in dBFS. */
  autoSensitivity: boolean;
  threshold: number;
  noiseSuppression: 'rnnoise' | 'off';
  echoCancellation: boolean;
  autoGainControl: boolean;
  sharePreset: SharePreset;
  statsOverlay: boolean;
}

export const DEFAULT_VOICE_SETTINGS: Readonly<VoiceSettings> = {
  inputDevice: '',
  outputDevice: '',
  cameraDevice: '',
  inputVolume: 100,
  outputVolume: 100,
  inputMode: 'voice',
  pushToTalkKey: null,
  autoSensitivity: true,
  threshold: -50,
  noiseSuppression: 'rnnoise',
  echoCancellation: true,
  autoGainControl: true,
  sharePreset: '1080p60',
  statsOverlay: false,
};

/** Per-user volumes in percent, and the users muted for this device only ("Mute for me"). */
interface Stored { settings: VoiceSettings; volumes: Record<string, number>; muted: string[] }

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const SHARE_PRESETS: SharePreset[] = ['1080p60', '1080p30', '720p30', 'text'];

/** Stored values over the defaults, field by field, so an older or damaged entry still gives whole settings. */
function sanitise(raw: unknown): VoiceSettings {
  const s = { ...DEFAULT_VOICE_SETTINGS };
  if (!raw || typeof raw !== 'object') return s;
  const r = raw as Record<string, unknown>;
  const str = (k: 'inputDevice' | 'outputDevice' | 'cameraDevice') => { if (typeof r[k] === 'string') s[k] = r[k]; };
  const bool = (k: 'autoSensitivity' | 'echoCancellation' | 'autoGainControl' | 'statsOverlay') => { if (typeof r[k] === 'boolean') s[k] = r[k]; };
  const num = (k: 'inputVolume' | 'outputVolume' | 'threshold', min: number, max: number) => {
    if (typeof r[k] === 'number' && Number.isFinite(r[k])) s[k] = clamp(r[k], min, max);
  };
  str('inputDevice'); str('outputDevice'); str('cameraDevice');
  bool('autoSensitivity'); bool('echoCancellation'); bool('autoGainControl'); bool('statsOverlay');
  num('inputVolume', 0, 200); num('outputVolume', 0, 200); num('threshold', -100, 0);
  if (r.inputMode === 'voice' || r.inputMode === 'ptt') s.inputMode = r.inputMode;
  if (r.noiseSuppression === 'rnnoise' || r.noiseSuppression === 'off') s.noiseSuppression = r.noiseSuppression;
  if (SHARE_PRESETS.includes(r.sharePreset as SharePreset)) s.sharePreset = r.sharePreset as SharePreset;
  const key = r.pushToTalkKey as Record<string, unknown> | null | undefined;
  if (key && typeof key.code === 'string' && typeof key.label === 'string') s.pushToTalkKey = { code: key.code, label: key.label };
  return s;
}

function read(): Stored {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { settings?: unknown; volumes?: unknown; muted?: unknown } | null;
    const volumes: Record<string, number> = {};
    if (raw?.volumes && typeof raw.volumes === 'object') {
      for (const [id, v] of Object.entries(raw.volumes)) if (typeof v === 'number' && Number.isFinite(v)) volumes[id] = clamp(v, 0, 200);
    }
    const muted = Array.isArray(raw?.muted) ? raw.muted.filter((id): id is string => typeof id === 'string') : [];
    return { settings: sanitise(raw?.settings), volumes, muted };
  } catch {
    return { settings: { ...DEFAULT_VOICE_SETTINGS }, volumes: {}, muted: [] };
  }
}

// Read once, then kept in memory: a blocked storage still gives settings that last until the tab closes.
let stored: Stored | undefined;
const current = () => (stored ??= read());
const listeners = new Set<(s: VoiceSettings) => void>();

function write(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(current()));
  } catch {
    // Storage blocked or full: the settings last until the tab closes.
  }
}

/** This device's voice settings, a fresh copy. */
export function loadVoiceSettings(): VoiceSettings {
  return { ...current().settings };
}

/** Changes some settings, saves them and tells the listeners. */
export function saveVoiceSettings(change: Partial<VoiceSettings>): VoiceSettings {
  const s = current();
  s.settings = sanitise({ ...s.settings, ...change });
  write();
  const copy = loadVoiceSettings();
  for (const fn of listeners) fn(copy);
  return copy;
}

/** Called with the new settings after every change, here or in another tab. Returns the unsubscribe. */
export function onVoiceSettings(fn: (s: VoiceSettings) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** A user's volume in percent, 100 unless set on this device. */
export function userVolume(userId: string): number {
  return current().volumes[userId] ?? 100;
}

/** Saves a user's volume in percent. 100 removes the entry. */
export function setUserVolume(userId: string, percent: number): void {
  const s = current();
  const v = clamp(Math.round(percent), 0, 200);
  if (v === 100) delete s.volumes[userId];
  else s.volumes[userId] = v;
  write();
}

/** Every volume set on this device, in percent, by user ID. */
export function userVolumes(): Record<string, number> {
  return { ...current().volumes };
}

/** The users muted for this device only. */
export function mutedForMe(): string[] {
  return [...current().muted];
}

/** Mutes or unmutes a user for this device only. Their volume is kept for when they're unmuted. */
export function setMutedForMe(userId: string, muted: boolean): void {
  const s = current();
  s.muted = s.muted.filter((id) => id !== userId);
  if (muted) s.muted.push(userId);
  write();
}

// Another tab saved: take its values, and tell the listeners if the settings themselves changed.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    const before = JSON.stringify(current().settings);
    stored = read();
    if (JSON.stringify(stored.settings) === before) return;
    const copy = loadVoiceSettings();
    for (const fn of listeners) fn(copy);
  });
}
