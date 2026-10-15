/**
 * The one context menu (m2b-plan.md task 3), opened by right-click, by a long press on touch screens, where iOS
 * sends no contextmenu event, or from the keyboard with the context-menu key or Shift+F10 (m4.5-plan.md task 2).
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

/**
 * When the context-menu key or Shift+F10 was last pressed. The browser turns either into a contextmenu event,
 * whose coordinates then say nothing useful, so the menu opens at the element instead.
 */
let menuKeyAt = -Infinity;
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) menuKeyAt = performance.now();
  }, true);
}

/** Events an inner element's menu already took, such as the author's name inside a message: the outer one stands aside. */
const claimed = new WeakSet<Event>();

/** Where a contextmenu event's menu opens: the pointer, or the element's top left corner when it came from the keyboard. */
function pointOf(e: MouseEvent, node: HTMLElement): { x: number; y: number } {
  const fromKey = performance.now() - menuKeyAt < 500 || (e.clientX === 0 && e.clientY === 0);
  if (!fromKey) return { x: e.clientX, y: e.clientY };
  const r = node.getBoundingClientRect();
  return { x: r.left + 8, y: Math.max(0, r.top) + 8 };
}

/**
 * `use:menuOn={(node, event) => items}`: open the context menu with these items on right-click, a long press or
 * the keyboard. `event` is the one that opened it, so a menu can offer more for what was pressed, such as a link.
 */
export function menuOn(node: HTMLElement, items: (node: HTMLElement, event?: Event) => MenuItem[]) {
  let get = items;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let opened = false;
  const cancel = () => { if (timer) clearTimeout(timer); timer = null; };
  const onContext = (e: MouseEvent) => {
    if (claimed.has(e)) return;
    cancel();
    // Android sends contextmenu for a long press too: one menu, not two.
    if (opened) {
      // This element's long press already opened its menu: an outer element mustn't open its own over it.
      claimed.add(e);
      e.preventDefault();
      return;
    }
    // No items, such as over selected text or the edit box: the browser's own menu shows.
    const list = get(node, e);
    if (!list.length) return;
    claimed.add(e);
    e.preventDefault();
    const at = pointOf(e, node);
    contextMenu.open(list, at.x, at.y);
  };
  const onTouchStart = (e: TouchEvent) => {
    opened = false;
    if (claimed.has(e)) return;
    claimed.add(e);
    const t = e.touches[0];
    if (!t) return;
    timer = setTimeout(() => {
      opened = true;
      contextMenu.open(get(node, e), t.clientX, t.clientY);
    }, LONG_PRESS_MS);
  };
  const onTouchEnd = (e: TouchEvent) => {
    cancel();
    // The press opened the menu: don't let the lift also click the element.
    if (opened) e.preventDefault();
    // Android's own contextmenu event for the same press comes just after: ignore it, then forget the
    // press, so a mouse right-click on a touch laptop still works.
    setTimeout(() => (opened = false), 700);
  };
  node.addEventListener('contextmenu', onContext);
  node.addEventListener('touchstart', onTouchStart, { passive: true });
  node.addEventListener('touchmove', cancel, { passive: true });
  node.addEventListener('touchend', onTouchEnd);
  node.addEventListener('touchcancel', cancel);
  return {
    update(next: (node: HTMLElement, event?: Event) => MenuItem[]) { get = next; },
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
