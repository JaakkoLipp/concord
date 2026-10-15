/**
 * `use:tooltip={text}`: a small label shown on hover and keyboard focus, placed above the element,
 * or below when there is no room. One tooltip element is shared by the whole page.
 * It fades in and grows slightly from the side facing the element. Moving straight on to a neighbour
 * shows the next one at once and without motion, as Discord does.
 */
let el: HTMLDivElement | null = null;
/** When the last tooltip was hidden, for the move to a neighbour. */
let hiddenAt = -Infinity;
const WARM_MS = 300;
const ENTER = 'opacity var(--dur-popover) var(--ease-out), scale calc(var(--dur-popover) * var(--motion)) var(--ease-out)';
const EXIT = 'opacity var(--dur-exit) var(--ease-out), scale calc(var(--dur-exit) * var(--motion)) var(--ease-out)';
const SMALL = 'calc(1 - 0.02 * var(--motion))';

function ensure(): HTMLDivElement {
  if (el) return el;
  el = document.createElement('div');
  el.setAttribute('role', 'tooltip');
  el.className = 'concord-tooltip';
  Object.assign(el.style, {
    position: 'fixed', zIndex: '1000', pointerEvents: 'none', maxWidth: '16rem', padding: '0.375rem 0.625rem',
    background: 'var(--surface-5)', color: 'var(--text-strong)', border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)', font: '500 var(--text-sm) var(--font-sans)', boxShadow: 'var(--shadow-popover)',
    opacity: '0', scale: SMALL, transition: EXIT, whiteSpace: 'nowrap',
  });
  document.body.append(el);
  return el;
}

export function tooltip(node: HTMLElement, text: string | undefined) {
  let current = text;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const show = (delay: number) => {
    if (!current) return;
    const warm = performance.now() - hiddenAt < WARM_MS;
    timer = setTimeout(() => {
      const tip = ensure();
      tip.textContent = current ?? '';
      const r = node.getBoundingClientRect();
      // Its layout size, unaffected by the scale it starts at.
      const t = { width: tip.offsetWidth, height: tip.offsetHeight };
      const above = r.top - t.height - 8;
      const top = above > 4 ? above : r.bottom + 8;
      const left = Math.max(4, Math.min(window.innerWidth - t.width - 4, r.left + r.width / 2 - t.width / 2));
      tip.style.transition = warm ? 'none' : ENTER;
      tip.style.top = `${top}px`;
      tip.style.left = `${left}px`;
      tip.style.transformOrigin = `${Math.round(r.left + r.width / 2 - left)}px ${top < r.top ? '100%' : '0'}`;
      tip.style.opacity = '1';
      tip.style.scale = '1';
    }, warm ? 0 : delay);
  };
  const hide = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (el && el.style.opacity === '1') {
      hiddenAt = performance.now();
      el.style.transition = EXIT;
      el.style.opacity = '0';
      el.style.scale = SMALL;
    }
  };
  const enter = () => show(400);
  const focus = () => { if (node.matches(':focus-visible')) show(0); };
  node.addEventListener('mouseenter', enter);
  node.addEventListener('mouseleave', hide);
  node.addEventListener('focus', focus);
  node.addEventListener('blur', hide);
  node.addEventListener('pointerdown', hide);
  return {
    update(next: string | undefined) { current = next; },
    destroy() {
      hide();
      node.removeEventListener('mouseenter', enter);
      node.removeEventListener('mouseleave', hide);
      node.removeEventListener('focus', focus);
      node.removeEventListener('blur', hide);
      node.removeEventListener('pointerdown', hide);
    },
  };
}
