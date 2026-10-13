/**
 * The one context menu (m2b-plan.md task 3), opened by right-click, or by a long press on touch screens,
 * where iOS sends no contextmenu event.
 */
import type { MenuItem } from '@concord/ui';

class ContextMenu {
  current = $state<{ items: MenuItem[]; at: { x: number; y: number } } | null>(null);

  open(items: MenuItem[], x: number, y: number): void {
    if (items.length) this.current = { items, at: { x, y } };
  }

  close(): void {
    this.current = null;
  }
}

export const contextMenu = new ContextMenu();

const LONG_PRESS_MS = 500;

/** `use:menuOn={(node) => items}`: open the context menu with these items on right-click or a long press. */
export function menuOn(node: HTMLElement, items: (node: HTMLElement) => MenuItem[]) {
  let get = items;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let opened = false;
  const cancel = () => { if (timer) clearTimeout(timer); timer = null; };
  const onContext = (e: MouseEvent) => {
    e.preventDefault();
    cancel();
    // Android sends contextmenu for a long press too: one menu, not two.
    if (opened) return;
    contextMenu.open(get(node), e.clientX, e.clientY);
  };
  const onTouchStart = (e: TouchEvent) => {
    opened = false;
    const t = e.touches[0];
    if (!t) return;
    timer = setTimeout(() => {
      opened = true;
      contextMenu.open(get(node), t.clientX, t.clientY);
    }, LONG_PRESS_MS);
  };
  const onTouchEnd = (e: TouchEvent) => {
    cancel();
    // The press opened the menu: don't let the lift also click the element.
    if (opened) e.preventDefault();
  };
  node.addEventListener('contextmenu', onContext);
  node.addEventListener('touchstart', onTouchStart, { passive: true });
  node.addEventListener('touchmove', cancel, { passive: true });
  node.addEventListener('touchend', onTouchEnd);
  node.addEventListener('touchcancel', cancel);
  return {
    update(next: (node: HTMLElement) => MenuItem[]) { get = next; },
    destroy() {
      cancel();
      node.removeEventListener('contextmenu', onContext);
      node.removeEventListener('touchstart', onTouchStart);
      node.removeEventListener('touchmove', cancel);
      node.removeEventListener('touchend', onTouchEnd);
      node.removeEventListener('touchcancel', cancel);
    },
  };
}
