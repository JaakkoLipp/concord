/**
 * Motion helpers for client.md section 9, reading their timings from tokens.css so the CSS and these agree.
 */
import { flip } from 'svelte/animate';
import { quintOut } from 'svelte/easing';

const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** A duration token in milliseconds. */
export function duration(name: string): number {
  const v = token(name);
  return v.endsWith('ms') ? parseFloat(v) : (parseFloat(v) || 0) * 1000;
}

/** False under reduced motion, when every timed effect is removed. */
export const moving = () => token('--motion') !== '0';

/** The last input was a key rather than a pointer, watched from the start. */
let keyboard = false;
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', () => (keyboard = true), true);
  window.addEventListener('pointerdown', () => (keyboard = false), true);
}

/** Whether the surface about to open was opened from the keyboard, which the last input decides. Keyboard-opened surfaces don't move. */
export const fromKeyboard = () => keyboard;

/**
 * `out:leave`: a closing surface fades and shrinks slightly toward its transform-origin, at --dur-exit.
 * Under reduced motion its token is zero. Svelte freezes an outgoing block through the outro and makes it inert.
 * quintOut is the curve --ease-out draws. `in:enter` is its opposite, at --dur-popover unless another token is named.
 */
export function enter(_node: HTMLElement, { name = '--dur-popover', instant = false }: { name?: string; instant?: boolean } = {}) {
  const shrink = moving() ? 0.02 : 0;
  return {
    duration: instant ? 0 : duration(name),
    easing: quintOut,
    css: (t: number) => `opacity: ${t}; scale: ${1 - shrink * (1 - t)};`,
  };
}

/** Siblings sliding into place after one leaves, as `animate:slide`: a flip at --dur-exit, none under reduced motion. */
export function slide(node: Element, rects: { from: DOMRect; to: DOMRect }) {
  return flip(node, rects, { duration: moving() ? duration('--dur-exit') : 0, easing: quintOut });
}

export function leave(_node: HTMLElement, { instant = false }: { instant?: boolean } = {}) {
  const shrink = moving() ? 0.02 : 0;
  return {
    duration: instant ? 0 : duration('--dur-exit'),
    easing: quintOut,
    css: (t: number) => `opacity: ${t}; scale: ${1 - shrink * (1 - t)}; pointer-events: none;`,
  };
}

const exits = new WeakMap<HTMLDialogElement, Animation[]>();

/**
 * `out:dialogLeave={dialog}`, on a native dialog's content: keeps the content while the dialog and its backdrop
 * fade out at --dur-exit, or finish at once under reduced motion. The dialog's owner calls `close()` when the outro ends, and `settle()` before reopening.
 */
export function dialogLeave(_node: Element, dialog: HTMLDialogElement | null | undefined) {
  if (!dialog?.open) return { duration: 0 };
  const ms = duration('--dur-exit');
  const options: KeyframeAnimationOptions = { duration: ms, easing: token('--ease-out'), fill: 'forwards' };
  dialog.inert = true;
  const list = [dialog.animate([{ opacity: 1, scale: 1 }, { opacity: 0, scale: moving() ? 0.98 : 1 }], options)];
  try {
    list.push(dialog.animate([{ opacity: 1 }, { opacity: 0 }], { ...options, pseudoElement: '::backdrop' }));
  } catch {
    // A browser that can't animate ::backdrop drops it at close instead.
  }
  exits.set(dialog, list);
  return { duration: ms };
}

/** Clears a dialog's exit: once it has closed, or when it opens again mid-exit. */
export function settle(dialog: HTMLDialogElement): void {
  for (const a of exits.get(dialog) ?? []) a.cancel();
  exits.delete(dialog);
  dialog.inert = false;
}
