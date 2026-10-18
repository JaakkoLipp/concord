/**
 * The quick voice menus behind the chevrons (m4.5-plan.md task 4): a device, volume and settings menu beside the
 * microphone and the headphones in the dock, and the same beside the call bar's microphone and camera
 * (m4.6-plan.md task 12b). A running call follows the saved settings at once; the camera's takes effect the next
 * time the camera turns on.
 */
import type { MenuItem } from '@concord/ui';
import { m } from '$lib/i18n/index.ts';
import { deviceOptions } from '$lib/settings/devices.ts';
import { openSettings } from '$lib/settings/modal.svelte.ts';
import { listDevices, maxOutputVolume, outputSelectable } from './audio/output.ts';
import { loadVoiceSettings, saveVoiceSettings, type SharePreset } from './settings.ts';
import type { VoiceController } from './controller.svelte.ts';

export type DeviceMenuKind = 'input' | 'output' | 'camera';

const FIELD = { input: 'inputDevice', output: 'outputDevice', camera: 'cameraDevice' } as const;
const KIND: Record<DeviceMenuKind, MediaDeviceKind> = { input: 'audioinput', output: 'audiooutput', camera: 'videoinput' };

export async function deviceMenu(kind: DeviceMenuKind): Promise<MenuItem[]> {
  const s = loadVoiceSettings();
  const t = m.settings.voice;
  const items: MenuItem[] = [];
  if (kind !== 'output' || outputSelectable()) {
    const chosen = s[FIELD[kind]];
    for (const o of deviceOptions(await listDevices(KIND[kind]))) {
      items.push({ kind: 'check', label: o.label, checked: o.id === chosen, onselect: () => saveVoiceSettings({ [FIELD[kind]]: o.id }) });
    }
    items.push('separator');
  }
  if (kind === 'input') items.push({ kind: 'range', label: t.inputVolume, value: s.inputVolume, min: 0, max: 200, format: t.percent, oninput: (v) => saveVoiceSettings({ inputVolume: v }) }, 'separator');
  if (kind === 'output') items.push({ kind: 'range', label: t.outputVolume, value: s.outputVolume, min: 0, max: maxOutputVolume(), format: t.percent, oninput: (v) => saveVoiceSettings({ outputVolume: v }) }, 'separator');
  items.push({ label: m.voice.voiceSettings, onselect: () => openSettings({ kind: 'user', section: 'voice' }) });
  return items;
}

const PRESETS: SharePreset[] = ['1080p60', '1080p30', '720p30', 'text'];

/**
 * Beside screen share: the quality preset, which the next share starts with (a running share would need the
 * browser's picker again), and Stop sharing while sharing.
 */
export function shareMenu(voice: VoiceController): MenuItem[] {
  const preset = loadVoiceSettings().sharePreset;
  const items: MenuItem[] = PRESETS.map((p) => ({
    kind: 'check', label: m.call.qualityItem(m.settings.voice.presets[p]), checked: preset === p, onselect: () => saveVoiceSettings({ sharePreset: p }),
  }));
  if (voice.sharing) items.push('separator', { label: m.voice.stopShare, onselect: () => voice.stopShare() });
  return items;
}
