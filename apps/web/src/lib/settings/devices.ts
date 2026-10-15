/** The choices for a device: the system default first, named after the device it is when the browser says. */
import { m } from '$lib/i18n/index.ts';

export function deviceOptions(list: MediaDeviceInfo[]): { id: string; label: string }[] {
  const t = m.settings.voice;
  const fallback = list.find((d) => d.deviceId === 'default');
  const named = fallback?.label.replace(/^Default\s*-\s*/, '');
  return [
    { id: '', label: named ? t.defaultNamed(named) : t.systemDefault },
    ...list.filter((d) => d.deviceId !== 'default' && d.deviceId).map((d, i) => ({ id: d.deviceId, label: d.label || t.unnamed(i + 1) })),
  ];
}
