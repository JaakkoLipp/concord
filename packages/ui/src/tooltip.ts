/** Per-target tooltips: no show delay, a token-driven crossfade, and no movement. */
import { duration } from './motion.ts';

export type TooltipPlacement = 'top' | 'right' | 'bottom';
export interface TooltipOptions {
  text?: string;
  /** Larger, bold title for a server tooltip. All content is plain text from the caller. */
  name?: string;
  detail?: string | undefined;
  placement?: TooltipPlacement;
}
export type TooltipContent = string | TooltipOptions | undefined;
interface Instance {
  target: HTMLElement;
  options: TooltipOptions;
  tip?: HTMLDivElement | undefined;
  timer?: ReturnType<typeof setTimeout> | undefined;
}
let active: Instance | undefined;
let sequence = 0;
const shown = new Set<Instance>();
let observer: MutationObserver | undefined;
const options = (value: TooltipContent): TooltipOptions => typeof value === 'string' ? { text: value } : value ?? {};

function remove(instance: Instance): void {
  clearTimeout(instance.timer);
  instance.timer = undefined;
  if (active === instance) active = undefined;
  const id = instance.tip?.id;
  if (id) {
    const ids = (instance.target.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((value) => value && value !== id);
    if (ids.length) instance.target.setAttribute('aria-describedby', ids.join(' '));
    else instance.target.removeAttribute('aria-describedby');
  }
  instance.tip?.remove();
  instance.tip = undefined;
  shown.delete(instance);
  if (!shown.size) { observer?.disconnect(); observer = undefined; }
}

function content(instance: Instance): void {
  const tip = instance.tip!;
  tip.replaceChildren();
  const value = instance.options;
  if (value.name !== undefined) {
    const title = document.createElement('span');
    title.textContent = value.name;
    Object.assign(title.style, { display: 'block', font: '700 var(--text-md) var(--font-sans)' });
    tip.append(title);
    if (value.detail) {
      const detail = document.createElement('span');
      detail.textContent = value.detail;
      Object.assign(detail.style, { display: 'block', font: '400 var(--text-xs) var(--font-sans)', color: 'var(--text-secondary)' });
      tip.append(detail);
    }
  } else tip.textContent = value.text ?? '';
  const caret = document.createElement('span');
  caret.className = 'tooltip-caret';
  caret.setAttribute('aria-hidden', 'true');
  Object.assign(caret.style, { position: 'absolute', width: '10px', height: '10px', background: 'var(--surface-1)', rotate: '45deg' });
  tip.append(caret);
}

function place(instance: Instance): void {
  const tip = instance.tip!;
  const r = instance.target.getBoundingClientRect();
  const { width, height } = tip.getBoundingClientRect();
  const gap = 8, pad = 4;
  let side: TooltipPlacement | 'left' = instance.options.placement ?? 'top';
  if (side === 'top' && r.top - height - gap < pad) side = 'bottom';
  if (side === 'bottom' && r.bottom + height + gap > innerHeight - pad && r.top - height - gap >= pad) side = 'top';
  if (side === 'right' && r.right + width + gap > innerWidth - pad && r.left - width - gap >= pad) side = 'left';
  let top = r.top + r.height / 2 - height / 2;
  let left = r.left + r.width / 2 - width / 2;
  if (side === 'top') top = r.top - height - gap;
  if (side === 'bottom') top = r.bottom + gap;
  if (side === 'right') left = r.right + gap;
  if (side === 'left') left = r.left - width - gap;
  top = Math.max(pad, Math.min(innerHeight - height - pad, top));
  left = Math.max(pad, Math.min(innerWidth - width - pad, left));
  Object.assign(tip.style, { top: `${top}px`, left: `${left}px` });
  tip.dataset.side = side;
  const caret = tip.lastElementChild as HTMLElement;
  caret.style.cssText += ';border:0;top:auto;right:auto;bottom:auto;left:auto;translate:0 0';
  const x = `${Math.max(8, Math.min(width - 8, r.left + r.width / 2 - left))}px`;
  const y = `${Math.max(8, Math.min(height - 8, r.top + r.height / 2 - top))}px`;
  if (side === 'top' || side === 'bottom') {
    caret.style.left = x; caret.style.translate = '-50% 0';
    caret.style[side === 'top' ? 'bottom' : 'top'] = '-5px';
    caret.style[side === 'top' ? 'borderBottom' : 'borderTop'] = '1px solid var(--border-default)';
    caret.style[side === 'top' ? 'borderRight' : 'borderLeft'] = '1px solid var(--border-default)';
  } else {
    caret.style.top = y; caret.style.translate = '0 -50%';
    caret.style[side === 'right' ? 'left' : 'right'] = '-5px';
    caret.style[side === 'right' ? 'borderLeft' : 'borderRight'] = '1px solid var(--border-default)';
    caret.style[side === 'right' ? 'borderBottom' : 'borderTop'] = '1px solid var(--border-default)';
  }
}

function hide(instance: Instance): void {
  if (!instance.tip) return;
  if (active === instance) active = undefined;
  instance.tip.dataset.open = 'false';
  instance.tip.style.opacity = '0';
  clearTimeout(instance.timer);
  const ms = duration('--dur-tooltip');
  if (!ms) remove(instance);
  else instance.timer = setTimeout(() => remove(instance), ms);
}

function show(instance: Instance): void {
  if (!instance.target.isConnected || !(instance.options.text || instance.options.name)) return;
  if (active === instance) return;
  if (active) hide(active);
  clearTimeout(instance.timer);
  if (!instance.tip) {
    const tip = document.createElement('div');
    instance.tip = tip;
    tip.id = `concord-tooltip-${++sequence}`;
    tip.className = 'concord-tooltip';
    tip.setAttribute('role', 'tooltip');
    Object.assign(tip.style, {
      position: 'fixed', zIndex: '1000', pointerEvents: 'none', maxWidth: '16rem',
      padding: '8px 12px', background: 'var(--surface-1)', color: 'var(--text-strong)',
      border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)',
      font: '600 var(--text-sm) var(--font-sans)', boxShadow: 'var(--shadow-popover)',
      opacity: '0', transition: 'opacity var(--dur-tooltip) var(--ease-standard)', overflowWrap: 'anywhere',
    });
    content(instance);
    document.body.append(tip);
    const ids = (instance.target.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
    instance.target.setAttribute('aria-describedby', [...ids, tip.id].join(' '));
    shown.add(instance);
    if (!observer) {
      observer = new MutationObserver(() => { for (const candidate of shown) if (!candidate.target.isConnected) remove(candidate); });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }
  place(instance);
  active = instance;
  // Commit opacity 0 before the target style so the fade starts with this hover, without a timer or frame delay.
  void getComputedStyle(instance.tip).opacity;
  instance.tip.dataset.open = 'true';
  instance.tip.style.opacity = '1';
}

/** `use:tooltip={label}` or `use:tooltip={{name, detail, placement: 'right'}}`. */
export function tooltip(target: HTMLElement, value: TooltipContent) {
  const instance: Instance = { target, options: options(value) };
  const enter = (event: PointerEvent) => { if (event.pointerType === 'mouse') show(instance); };
  const focus = () => { if (target.matches(':focus-visible')) show(instance); };
  const leave = () => hide(instance);
  const reposition = () => { if (instance.tip && active === instance) place(instance); };
  target.addEventListener('pointerenter', enter);
  target.addEventListener('pointerleave', leave);
  target.addEventListener('focus', focus);
  target.addEventListener('blur', leave);
  target.addEventListener('pointerdown', leave);
  window.addEventListener('resize', reposition);
  window.addEventListener('scroll', reposition, true);
  return {
    update(value: TooltipContent) {
      const next = options(value), old = instance.options;
      if (next.text === old.text && next.name === old.name && next.detail === old.detail && next.placement === old.placement) return;
      instance.options = next;
      if (instance.tip) {
        if (!next.text && !next.name) remove(instance);
        else { content(instance); place(instance); }
      }
    },
    destroy() {
      remove(instance);
      target.removeEventListener('pointerenter', enter);
      target.removeEventListener('pointerleave', leave);
      target.removeEventListener('focus', focus);
      target.removeEventListener('blur', leave);
      target.removeEventListener('pointerdown', leave);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    },
  };
}
