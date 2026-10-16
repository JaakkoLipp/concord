import { describe, expect, it } from 'vitest';
import { shouldRedirect, type RedirectInput } from './typeToFocus.ts';

/** A press on the page body, with nothing open, in a channel the user can send in. Each test changes one thing. */
const base: RedirectInput = {
  key: 'h', ctrl: false, alt: false, meta: false, isComposing: false, defaultPrevented: false,
  targetKind: 'body', insideDialog: false, openSurface: false, composer: true, recording: false,
};
const redirect = (over: Partial<RedirectInput>) => shouldRedirect({ ...base, ...over });

describe('shouldRedirect', () => {
  it('sends a printable key on the body to the composer', () => {
    expect(redirect({})).toBe(true);
    expect(redirect({ key: 'H' })).toBe(true);
    expect(redirect({ key: '?' })).toBe(true);
    expect(redirect({ key: 'ö' })).toBe(true);
  });

  it('sends Ctrl+V and Cmd+V, but not Ctrl+Alt+V or Ctrl+Meta+V', () => {
    expect(redirect({ key: 'v', ctrl: true })).toBe(true);
    expect(redirect({ key: 'V', ctrl: true })).toBe(true);
    expect(redirect({ key: 'v', meta: true })).toBe(true);
    expect(redirect({ key: 'v', ctrl: true, alt: true })).toBe(false);
    expect(redirect({ key: 'v', ctrl: true, meta: true })).toBe(false);
  });

  it('leaves other Ctrl, Alt and Meta combinations alone', () => {
    expect(redirect({ key: 'k', ctrl: true })).toBe(false);
    expect(redirect({ key: 'h', alt: true })).toBe(false);
    expect(redirect({ key: 'h', meta: true })).toBe(false);
  });

  it('leaves keys that are not a single printable character alone', () => {
    for (const key of ['Enter', 'Escape', 'ArrowDown', 'Backspace', 'Tab', 'Dead', 'Unidentified']) {
      expect(redirect({ key })).toBe(false);
    }
  });

  it('leaves IME composition and already-handled presses alone', () => {
    expect(redirect({ isComposing: true })).toBe(false);
    expect(redirect({ defaultPrevented: true })).toBe(false);
  });

  it('leaves a press aimed at text, a control or a message row alone', () => {
    expect(redirect({ targetKind: 'typing' })).toBe(false);
    expect(redirect({ targetKind: 'control' })).toBe(false);
  });

  it('lets Space through on the body and plain text, but not on a focusable element', () => {
    expect(redirect({ key: ' ', targetKind: 'body' })).toBe(true);
    expect(redirect({ key: ' ', targetKind: 'plain' })).toBe(true);
    expect(redirect({ key: ' ', targetKind: 'focusable' })).toBe(false);
  });

  it('lets letters through on a focusable element that is not a control', () => {
    expect(redirect({ key: 'a', targetKind: 'focusable' })).toBe(true);
  });

  it('leaves the press alone inside a dialog, with a menu or picker open, or while a keybind is recorded', () => {
    expect(redirect({ insideDialog: true })).toBe(false);
    expect(redirect({ openSurface: true })).toBe(false);
    expect(redirect({ recording: true })).toBe(false);
  });

  it('does nothing when the composer is not on screen, such as a channel the user cannot send in', () => {
    expect(redirect({ composer: false })).toBe(false);
  });
});
