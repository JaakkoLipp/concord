import { describe, expect, it, vi } from 'vitest';
import { handle, list, ownedBy, register, setRecording } from './shortcuts.ts';

/** A key press with its modifiers; the test checks `preventDefault` was called. */
const press = (code: string, mods: Partial<Record<'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey' | 'repeat', boolean>> = {}) => ({
  code, key: code, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, repeat: false, ...mods,
  preventDefault: vi.fn(),
});
const keys = (code: string, alt = true) => ({ code, key: code, ctrl: false, shift: false, alt, meta: false });

describe('shortcut registry', () => {
  it('lists the shortcuts dialog shortcut on Ctrl+/', () => {
    const entry = ownedBy({ code: 'Slash', key: '/', ctrl: true, shift: false, alt: false, meta: false });
    expect(entry?.id).toBe('shortcuts-list');
    expect(list().map((s) => s.id)).toContain('shortcuts-list');
  });

  it('rejects a duplicate id', () => {
    register({ id: 'test-dup-id', keys: keys('KeyA01'), label: 'first', run: () => {} });
    expect(() => register({ id: 'test-dup-id', keys: keys('KeyA02'), label: 'second', run: () => {} })).toThrow(/already registered/);
  });

  it('rejects a key combination another entry owns', () => {
    register({ id: 'test-owner', keys: keys('KeyB01'), label: 'owner', run: () => {} });
    expect(() => register({ id: 'test-clash', keys: keys('KeyB01'), label: 'clash', run: () => {} })).toThrow(/uses the keys of "test-owner"/);
    // The same code with other modifiers is another combination.
    expect(() => register({ id: 'test-other-mods', keys: keys('KeyB01', false), label: 'fine', run: () => {} })).not.toThrow();
  });

  it('finds the owner of a key combination, or nothing', () => {
    register({ id: 'test-owned', keys: keys('KeyC01'), label: 'owned', run: () => {} });
    expect(ownedBy(keys('KeyC01'))?.id).toBe('test-owned');
    expect(ownedBy(keys('KeyC99'))).toBeUndefined();
  });

  it('runs the matching entry, prevents the default, and says it handled the event', () => {
    const run = vi.fn();
    register({ id: 'test-run', keys: keys('KeyD01'), label: 'run', run });
    const e = press('KeyD01', { altKey: true });
    expect(handle(e)).toBe(true);
    expect(run).toHaveBeenCalledOnce();
    expect(e.preventDefault).toHaveBeenCalledOnce();
    expect(handle(press('KeyD01'))).toBe(false);
    expect(run).toHaveBeenCalledOnce();
  });

  it('does nothing while a keybind is being recorded, and resumes after', () => {
    const run = vi.fn();
    register({ id: 'test-recording', keys: keys('KeyE01'), label: 'recording', run });
    setRecording(true);
    const e = press('KeyE01', { altKey: true });
    expect(handle(e)).toBe(false);
    expect(run).not.toHaveBeenCalled();
    expect(e.preventDefault).not.toHaveBeenCalled();
    setRecording(false);
    expect(handle(press('KeyE01', { altKey: true }))).toBe(true);
    expect(run).toHaveBeenCalledOnce();
  });

  it('ignores key repeats, so a held key runs its shortcut once', () => {
    const run = vi.fn();
    register({ id: 'test-repeat', keys: keys('KeyF01'), label: 'repeat', run });
    expect(handle(press('KeyF01', { altKey: true, repeat: true }))).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });
});
