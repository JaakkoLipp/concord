/**
 * `use:tooltip={text}`: a small label shown on hover and keyboard focus, placed above the element,
 * or below when there is no room. One tooltip element is shared by the whole page.
 */
let el: HTMLDivElement | null = null;

function ensure(): HTMLDivElement {
  if (el) return el;
  el = document.createElement('div');
  el.setAttribute('role', 'tooltip');
  el.className = 'concord-tooltip';
  Object.assign(el.style, {
    position: 'fixed', zIndex: '1000', pointerEvents: 'none', maxWidth: '16rem', padding: '0.375rem 0.625rem',
    background: 'var(--surface-5)', color: 'var(--text-strong)', border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)', font: '500 var(--text-sm) var(--font-sans)', boxShadow: 'var(--shadow-popover)',
    opacity: '0', transition: 'opacity var(--dur-popover) var(--ease-out)', whiteSpace: 'nowrap',
  });
  document.body.append(el);
  return el;
}

export function tooltip(node: HTMLElement, text: string | undefined) {
  let current = text;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const show = (delay: number) => {
    if (!current) return;
    timer = setTimeout(() => {
      const tip = ensure();
      tip.textContent = current ?? '';
      const r = node.getBoundingClientRect();
      const t = tip.getBoundingClientRect();
      const above = r.top - t.height - 8;
      tip.style.top = `${above > 4 ? above : r.bottom + 8}px`;
      tip.style.left = `${Math.max(4, Math.min(window.innerWidth - t.width - 4, r.left + r.width / 2 - t.width / 2))}px`;
      tip.style.opacity = '1';
    }, delay);
  };
  const hide = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (el) el.style.opacity = '0';
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
