import { describe, expect, it } from 'vitest';
import { DEFAULT_MUTE_KEY, keybindFrom, keybindLabel, matches, parseKeybind, sameKeybind } from './keybinds.ts';

const press = (code: string, key: string, mods: Partial<Record<'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey', boolean>> = {}) =>
  ({ code, key, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...mods });

describe('keybinds', () => {
  it('takes a key with a modifier, labelled by the key itself', () => {
    const b = keybindFrom(press('KeyM', 'M', { ctrlKey: true, shiftKey: true }));
    expect(b && keybindLabel(b)).toBe('Ctrl + Shift + M');
    expect(keybindLabel(keybindFrom(press('Digit2', '@', { altKey: true }))!)).toBe('Alt + 2');
  });

  it('takes a function key alone, but not a key typing would set off', () => {
    expect(keybindFrom(press('F13', 'F13'))?.key).toBe('F13');
    for (const e of [press('KeyM', 'm'), press('KeyM', 'M', { shiftKey: true }), press('Space', ' '), press('ShiftLeft', 'Shift', { shiftKey: true }), press('ControlLeft', 'Control', { ctrlKey: true })]) {
      expect(keybindFrom(e)).toBeNull();
    }
  });

  it('matches only the exact modifiers', () => {
    expect(matches(DEFAULT_MUTE_KEY, press('KeyM', 'M', { ctrlKey: true, shiftKey: true }))).toBe(true);
    expect(matches(DEFAULT_MUTE_KEY, press('KeyM', 'm', { ctrlKey: true }))).toBe(false);
    expect(matches(DEFAULT_MUTE_KEY, press('KeyM', 'M', { ctrlKey: true, shiftKey: true, altKey: true }))).toBe(false);
    expect(matches(null, press('KeyM', 'M', { ctrlKey: true, shiftKey: true }))).toBe(false);
  });

  it('reads a stored keybind back, and refuses junk', () => {
    expect(sameKeybind(parseKeybind(JSON.parse(JSON.stringify(DEFAULT_MUTE_KEY))), DEFAULT_MUTE_KEY)).toBe(true);
    expect(parseKeybind({ code: 5 })).toBeNull();
    expect(parseKeybind('KeyM')).toBeNull();
  });
});
