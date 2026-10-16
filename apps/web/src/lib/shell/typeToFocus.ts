/**
 * Typing starts a message (M4.8 task 2b): with nothing focused on a channel, a printable key or a paste goes to the
 * composer, as on Discord. Not a registry entry, since the registry only matches modifier combinations. Shell.svelte
 * calls typeToFocus from the same window listener as the registry, after it.
 */
import { composerReady, focusComposer } from '../view/composerFocus.ts';
import { insideDialog, recording, somethingOpen, typingTarget } from './shortcuts.ts';

/** What a press is aimed at: the page itself, text a key types into, a control, or something else. */
export type TargetKind = 'body' | 'plain' | 'focusable' | 'control' | 'typing';

/** The plain facts the redirect rule reads. The DOM reads happen in typeToFocus; the rule is a pure function of these. */
export interface RedirectInput {
  key: string;
  ctrl: boolean;
  alt: boolean;
  meta: boolean;
  isComposing: boolean;
  defaultPrevented: boolean;
  targetKind: TargetKind;
  insideDialog: boolean;
  /** A menu, popover, picker, dialog or autocomplete list is open. */
  openSurface: boolean;
  /**
   * The composer is on screen and takes text: a channel route, with the editor shown (not a "you can't send" notice).
   * The composer registers only then, so this one flag stands for both.
   */
  composer: boolean;
  /** The voice keybind recorder is waiting for a key. */
  recording: boolean;
}

/**
 * Whether the press should land in the composer. A printable key with no Ctrl, Alt or Meta, or Ctrl+V / Cmd+V, when
 * nothing else is using the key. Space and Enter on a focused control still activate it, so a control, a message row
 * and a focusable element (for Space) are skipped.
 */
export function shouldRedirect(i: RedirectInput): boolean {
  const paste = i.ctrl !== i.meta && !i.alt && i.key.toLowerCase() === 'v';
  const printable = i.key.length === 1 && !i.ctrl && !i.alt && !i.meta;
  if (!paste && !printable) return false;
  if (i.isComposing || i.key === 'Dead' || i.defaultPrevented) return false;
  if (i.targetKind === 'typing' || i.targetKind === 'control') return false;
  if (i.key === ' ' && i.targetKind === 'focusable') return false;
  if (i.insideDialog || i.openSurface || i.recording) return false;
  return i.composer;
}

/** Controls that Space and Enter activate, and the message rows the actions sit in. */
const CONTROL = [
  'button', 'a', 'summary', 'select', 'audio', 'video', 'article.message',
  '[role="button"]', '[role="menuitem"]', '[role="menuitemcheckbox"]', '[role="menuitemradio"]', '[role="tab"]', '[role="option"]',
  '[role="checkbox"]', '[role="radio"]', '[role="switch"]', '[role="slider"]', '[role="link"]',
].join(', ');

function targetKind(e: KeyboardEvent): TargetKind {
  if (typingTarget(e)) return 'typing';
  const el = e.target instanceof Element ? e.target : null;
  if (!el || el === document.body || el === document.documentElement) return 'body';
  if (el.closest(CONTROL)) return 'control';
  return (el as HTMLElement).tabIndex >= 0 ? 'focusable' : 'plain';
}

/** Focuses the composer and lets the press go on to it, when the rule says so. Returns whether it focused the composer. */
export function typeToFocus(e: KeyboardEvent): boolean {
  const redirect = shouldRedirect({
    key: e.key, ctrl: e.ctrlKey, alt: e.altKey, meta: e.metaKey, isComposing: e.isComposing, defaultPrevented: e.defaultPrevented,
    targetKind: targetKind(e), insideDialog: insideDialog(e), openSurface: somethingOpen(), composer: composerReady(), recording,
  });
  // No preventDefault: the browser delivers this same keypress (or paste) to the editor that now has focus.
  return redirect && focusComposer();
}
