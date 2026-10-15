/**
 * Keybinds for mute and deafen (m4.5-results.md task 4): a key with its modifiers, matched by `code`, so the
 * layout doesn't matter. Each needs Ctrl, Alt, Shift or Meta, or is a function key, so typing never sets one off.
 */

export interface Keybind {
  code: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  /** The key as the user saw it, such as "M" or "F13". */
  key: string;
}

const MODIFIER_CODES = /^(Control|Shift|Alt|Meta|OS)(Left|Right)?$/;
const FUNCTION_KEY = /^F([1-9]|1\d|2[0-4])$/;

/** The keybind a key press makes, or null for a modifier alone or a plain key that typing would set off. */
export function keybindFrom(e: Pick<KeyboardEvent, 'code' | 'key' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey'>): Keybind | null {
  if (!e.code || MODIFIER_CODES.test(e.code)) return null;
  const bind = { code: e.code, ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey, key: keyLabel(e) };
  const modified = bind.ctrl || bind.alt || bind.meta || (bind.shift && FUNCTION_KEY.test(e.code));
  return modified || FUNCTION_KEY.test(e.code) ? bind : null;
}

function keyLabel(e: Pick<KeyboardEvent, 'code' | 'key'>): string {
  // The letter or digit on the key, not what Shift or Alt turned it into.
  const m = /^(?:Key|Digit)(.)$/.exec(e.code);
  if (m) return m[1]!;
  if (e.key === ' ') return 'Space';
  return e.key.length === 1 ? e.key.toUpperCase() : e.key;
}

export function matches(bind: Keybind | null | undefined, e: Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey'>): boolean {
  return !!bind && e.code === bind.code && e.ctrlKey === bind.ctrl && e.shiftKey === bind.shift && e.altKey === bind.alt && e.metaKey === bind.meta;
}

export const sameKeybind = (a: Keybind | null | undefined, b: Keybind | null | undefined) =>
  !!a && !!b && a.code === b.code && a.ctrl === b.ctrl && a.shift === b.shift && a.alt === b.alt && a.meta === b.meta;

/** As shown in settings, such as "Ctrl + Shift + M". */
export function keybindLabel(bind: Keybind): string {
  return [bind.ctrl && 'Ctrl', bind.alt && 'Alt', bind.shift && 'Shift', bind.meta && 'Meta', bind.key].filter(Boolean).join(' + ');
}

/** A stored keybind, or null when it isn't one. */
export function parseKeybind(raw: unknown): Keybind | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.code !== 'string' || typeof r.key !== 'string') return null;
  const flag = (k: string) => r[k] === true;
  return { code: r.code, key: r.key, ctrl: flag('ctrl'), shift: flag('shift'), alt: flag('alt'), meta: flag('meta') };
}

export const DEFAULT_MUTE_KEY: Keybind = { code: 'KeyM', key: 'M', ctrl: true, shift: true, alt: false, meta: false };
export const DEFAULT_DEAFEN_KEY: Keybind = { code: 'KeyD', key: 'D', ctrl: true, shift: true, alt: false, meta: false };
