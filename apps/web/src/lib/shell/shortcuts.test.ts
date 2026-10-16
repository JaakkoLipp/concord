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

  it('runs a match only when its guard says yes, and leaves the press alone when it says no', () => {
    const run = vi.fn();
    let allowed = false;
    register({ id: 'test-guarded', keys: keys('KeyG01', false), label: 'guarded', run, when: () => allowed });
    const refused = press('KeyG01');
    expect(handle(refused)).toBe(false);
    expect(refused.preventDefault).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    allowed = true;
    const accepted = press('KeyG01');
    expect(handle(accepted)).toBe(true);
    expect(accepted.preventDefault).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledOnce();
  });

  it('gives the guard the event, so it can read its target', () => {
    const seen: unknown[] = [];
    const target = { closest: () => null };
    register({ id: 'test-guard-event', keys: keys('KeyH01', false), label: 'event', run: () => {}, when: (e) => { seen.push(e.target); return false; } });
    handle({ ...press('KeyH01'), target } as never);
    expect(seen).toEqual([target]);
  });
});
