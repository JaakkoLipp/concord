/**
 * Motion helpers for client.md section 9, reading their timings from tokens.css so the CSS and these agree.
 */
import { quintOut } from 'svelte/easing';

const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** A duration token in milliseconds. */
export function duration(name: string): number {
  const v = token(name);
  return v.endsWith('ms') ? parseFloat(v) : (parseFloat(v) || 0) * 1000;
}

/** False under reduced motion, when only fades remain. */
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
 * Svelte freezes an outgoing block, so it keeps showing what it showed. It ignores the pointer and focus as it goes.
 * quintOut is the curve --ease-out draws.
 */
export function leave(node: HTMLElement, { instant = false }: { instant?: boolean } = {}) {
  node.inert = true;
  const shrink = moving() ? 0.02 : 0;
  return {
    duration: instant ? 0 : duration('--dur-exit'),
    easing: quintOut,
    css: (t: number) => `opacity: ${t}; scale: ${1 - shrink * (1 - t)}; pointer-events: none;`,
  };
}
