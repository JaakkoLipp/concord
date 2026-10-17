/**
 * Motion helpers for client.md section 9, reading their timings from tokens.css so the CSS and these agree.
 */
import { flip } from 'svelte/animate';
import { quintOut } from 'svelte/easing';
import { springAt, springSettled, type SpringState } from './spring.ts';

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

interface ScrollSpring {
  start: SpringState;
  target: number;
  startedAt: number;
  frame: number;
  onInput: () => void;
}

const scrollSprings = new WeakMap<HTMLElement, ScrollSpring>();

function maxScrollTop(element: HTMLElement): number {
  return Math.max(0, element.scrollHeight - element.clientHeight);
}

function boundedTarget(element: HTMLElement, target: number): number {
  return Math.min(maxScrollTop(element), Math.max(0, Number.isFinite(target) ? target : 0));
}

/** Whether this element currently has an active spring scroll, for scroll-spy suppression. */
export function springScrolling(element: HTMLElement): boolean {
  return scrollSprings.has(element);
}

/** Cancels a spring and removes its input listeners. */
export function cancelSpringScroll(element: HTMLElement): void {
  const run = scrollSprings.get(element);
  if (!run) return;
  cancelAnimationFrame(run.frame);
  element.removeEventListener('wheel', run.onInput);
  element.removeEventListener('touchstart', run.onInput);
  scrollSprings.delete(element);
}

/**
 * Scrolls vertically with a critically damped spring at 12.75 rad/s. Retargeting starts from the analytic
 * position and velocity at the current time, so missed frames do not stretch the animation and velocity is kept.
 */
export function springScrollTo(element: HTMLElement, target: number): void {
  const nextTarget = boundedTarget(element, target);
  if (typeof window === 'undefined' || !moving()) {
    cancelSpringScroll(element);
    element.scrollTop = nextTarget;
    return;
  }

  const now = performance.now();
  const existing = scrollSprings.get(element);
  let start: SpringState;
  let onInput: () => void;
  if (existing) {
    start = springAt(existing.start, existing.target, now - existing.startedAt);
    cancelAnimationFrame(existing.frame);
    existing.start = start;
    existing.target = nextTarget;
    existing.startedAt = now;
    onInput = existing.onInput;
  } else {
    start = { position: Math.min(maxScrollTop(element), Math.max(0, element.scrollTop)), velocity: 0 };
    if (springSettled(start, nextTarget)) {
      element.scrollTop = nextTarget;
      return;
    }
    onInput = () => cancelSpringScroll(element);
    element.addEventListener('wheel', onInput, { passive: true });
    element.addEventListener('touchstart', onInput, { passive: true });
    scrollSprings.set(element, { start, target: nextTarget, startedAt: now, frame: 0, onInput });
  }

  const run = scrollSprings.get(element)!;
  run.start = start;
  run.target = nextTarget;
  run.startedAt = now;

  const tick = (at: number) => {
    if (scrollSprings.get(element) !== run) return;
    if (!moving()) {
      element.scrollTop = boundedTarget(element, run.target);
      cancelSpringScroll(element);
      return;
    }
    const currentTarget = boundedTarget(element, run.target);
    if (currentTarget !== run.target) {
      run.start = springAt(run.start, run.target, at - run.startedAt);
      run.target = currentTarget;
      run.startedAt = at;
    }
    const state = springAt(run.start, run.target, at - run.startedAt);
    const limit = maxScrollTop(element);
    const position = Math.min(limit, Math.max(0, state.position));
    if (position !== state.position) {
      const hitsBoundaryOutward = (position === 0 && state.velocity < 0) || (position === limit && state.velocity > 0);
      run.start = { position, velocity: hitsBoundaryOutward ? 0 : state.velocity };
      run.startedAt = at;
    }
    element.scrollTop = position;
    if (springSettled({ position, velocity: state.velocity }, run.target)) {
      element.scrollTop = run.target;
      cancelSpringScroll(element);
      return;
    }
    run.frame = requestAnimationFrame(tick);
  };
  run.frame = requestAnimationFrame(tick);
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

/**
 * `use:fadeIn={src}` on an image (motion spec 4.8): transparent over its placeholder until it loads, then it fades in
 * over --dur-image. One already loaded, from the cache, shows at once. A new `src` waits and fades again. The
 * classes are styled in base.css.
 */
export function fadeIn(img: HTMLImageElement, _src?: string) {
  const loaded = () => img.classList.remove('concord-loading');
  const arm = () => {
    img.classList.add('concord-fade');
    if (img.complete && img.naturalWidth) return;
    img.classList.add('concord-loading');
  };
  img.addEventListener('load', loaded);
  img.addEventListener('error', loaded);
  arm();
  return {
    update() { arm(); },
    destroy() { img.removeEventListener('load', loaded); img.removeEventListener('error', loaded); },
  };
}

/** Clears a dialog's exit: once it has closed, or when it opens again mid-exit. */
export function settle(dialog: HTMLDialogElement): void {
  for (const a of exits.get(dialog) ?? []) a.cancel();
  exits.delete(dialog);
  dialog.inert = false;
}
