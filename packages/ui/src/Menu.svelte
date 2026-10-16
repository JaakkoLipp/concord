<script lang="ts">
  /**
   * A menu of actions, opened from a button or at the pointer for a right-click or long press. Arrow keys,
   * Home and End move, Enter or Space picks, Escape or Tab closes, as the ARIA menu pattern describes.
   * Checkboxes toggle and close like actions (unless they `stay`); a slider keeps the menu open and moves with Left and Right.
   * A submenu item opens one more menu to the side, by hover, click or Right; Left or Escape closes just that one.
   * It grows from the point it was opened at and fades out on close, except when opened from the keyboard.
   */
  import { tick } from 'svelte';
  import MenuSlider from './MenuSlider.svelte';
  import { fromKeyboard, leave } from './motion.ts';
  import type { MenuItem, MenuSub, MenuSubItem } from './types.ts';
  interface Props {
    open: boolean;
    onclose: () => void;
    items: MenuItem[];
    label: string;
    /** Open beside this element. */
    anchor?: HTMLElement | null;
    /** Or at this point, for a context menu. */
    at?: { x: number; y: number } | null;
  }
  let { open, onclose, items, label, anchor = null, at = null }: Props = $props();
  let panel = $state<HTMLDivElement | null>(null);
  let pos = $state({ top: 0, left: 0 });
  let origin = $state('top left');
  let still = $state(false);

  /** The open submenu: which root item it belongs to, and where that item is. */
  let sub = $state<{ index: number; item: MenuSub; anchor: HTMLElement } | null>(null);
  let subPanel = $state<HTMLDivElement | null>(null);
  let subPos = $state({ top: 0, left: 0 });
  /** Checkboxes that `stay` flip here at once, since the items are a snapshot taken when the menu opened. */
  let flipped = $state<Record<string, boolean>>({});
  let subTimer: ReturnType<typeof setTimeout> | undefined;
  /** Time the pointer needs to rest on a submenu item before it opens, and to stay away from one before it closes. */
  const OPEN_MS = 120;
  const CLOSE_MS = 280;

  function place() {
    if (!panel) return;
    const p = panel.getBoundingClientRect();
    const gap = 8;
    let top = 0;
    let left = 0;
    // The point it grows from: the click, or the middle of the anchor's edge nearest the menu.
    let from = { x: 0, y: 0 };
    if (at) {
      top = at.y;
      left = at.x;
      from = at;
    } else if (anchor) {
      const a = anchor.getBoundingClientRect();
      // Below the anchor, or above it when there isn't room, as for the user dock at the bottom.
      top = a.bottom + 4 + p.height + gap > window.innerHeight && a.top - 4 - p.height >= gap ? a.top - 4 - p.height : a.bottom + 4;
      left = a.right - p.width;
      from = { x: a.left + a.width / 2, y: a.bottom };
    }
    top = Math.max(gap, Math.min(window.innerHeight - p.height - gap, top));
    left = Math.max(gap, Math.min(window.innerWidth - p.width - gap, left));
    if (anchor && !at && top < anchor.getBoundingClientRect().top) from.y = anchor.getBoundingClientRect().top;
    pos = { top, left };
    origin = `${Math.round(from.x - left)}px ${Math.round(from.y - top)}px`;
  }

  const focusables = (from: HTMLElement | null) => [...(from?.querySelectorAll<HTMLElement>('button:not(:disabled), input') ?? [])];
  const buttons = () => focusables(panel);

  function key(e: KeyboardEvent, from: HTMLElement | null, inSub: boolean) {
    const list = focusables(from);
    const i = list.indexOf(document.activeElement as HTMLElement);
    const next = e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : null;
    if (next !== null) {
      e.preventDefault();
      list[(next + list.length) % list.length]?.focus();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      onclose();
    } else if (inSub && e.key === 'ArrowLeft' && (document.activeElement as HTMLElement | null)?.getAttribute('type') !== 'range') {
      e.preventDefault();
      closeSub(true);
    } else if (!inSub && e.key === 'ArrowRight') {
      const at = document.activeElement as HTMLElement | null;
      const index = at?.dataset.sub;
      if (at && index !== undefined) {
        e.preventDefault();
        openSub(Number(index), at, true);
      }
    }
  }

  function pick(item: { onselect: () => void }) {
    onclose();
    item.onselect();
  }

  function pickCheck(item: Extract<MenuSubItem, { kind: 'check' }>, id: string) {
    if (!item.stay) return pick(item);
    flipped[id] = !(flipped[id] ?? item.checked);
    item.onselect();
  }

  function openSub(index: number, anchor: HTMLElement, focus: boolean) {
    clearTimeout(subTimer);
    const item = items[index];
    if (!item || item === 'separator' || item.kind !== 'submenu') return;
    if (sub?.index !== index) sub = { index, item, anchor };
    void tick().then(() => {
      placeSub();
      if (focus) focusables(subPanel)[0]?.focus();
    });
  }

  /** Close the submenu, and with `refocus` put the focus back on the item that opened it. */
  function closeSub(refocus: boolean) {
    clearTimeout(subTimer);
    const anchor = sub?.anchor;
    sub = null;
    if (refocus) anchor?.focus();
  }

  /** Beside the item that opened it: to its right, or to its left when there is no room. */
  function placeSub() {
    if (!subPanel || !sub) return;
    const a = sub.anchor.getBoundingClientRect();
    const p = subPanel.getBoundingClientRect();
    const gap = 8;
    let left = a.right + 2;
    if (left + p.width > window.innerWidth - gap) left = Math.max(gap, a.left - p.width - 2);
    // Level with the item, nudged up by the panel's padding so the first entries line up.
    const top = Math.max(gap, Math.min(window.innerHeight - p.height - gap, a.top - 8));
    subPos = { top, left };
  }

  /** The pointer rests on a root item: a submenu item opens after a beat, anything else closes the open one. */
  function hover(e: PointerEvent, index: number, isSub: boolean) {
    if (e.pointerType !== 'mouse') return;
    clearTimeout(subTimer);
    if (isSub) subTimer = setTimeout(() => openSub(index, e.currentTarget as HTMLElement, false), sub ? 0 : OPEN_MS);
    else if (sub) subTimer = setTimeout(() => closeSub(false), CLOSE_MS);
  }

  $effect(() => {
    if (!open) return;
    const returnTo = document.activeElement as HTMLElement | null;
    still = fromKeyboard();
    sub = null;
    flipped = {};
    void tick().then(() => {
      place();
      buttons()[0]?.focus();
    });
    // Escape closes the submenu first, if one is open, and then the menu.
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (sub) closeSub(true);
      else onclose();
    };
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panel && !panel.contains(t) && !subPanel?.contains(t) && !anchor?.contains(t)) onclose();
    };
    window.addEventListener('keydown', esc, true);
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('resize', onclose);
    return () => {
      window.removeEventListener('keydown', esc, true);
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('resize', onclose);
      clearTimeout(subTimer);
      if (returnTo?.isConnected) returnTo.focus();
    };
  });
</script>

{#snippet list(entries: MenuItem[], scope: string)}
  {#each entries as item, i (i)}
    {#if item === 'separator'}
      <div class="separator" role="separator"></div>
    {:else if item.kind === 'range'}
      <MenuSlider {item} />
    {:else if item.kind === 'row'}
      <div class="row" role="group" aria-label={item.label}>
        {#each item.items as entry, j (j)}
          <button role="menuitem" class="chip" aria-label={entry.label} title={entry.label} onclick={() => pick(entry)}>
            {#if entry.image}<img src={entry.image} alt="" draggable="false" />{:else}{entry.text}{/if}
          </button>
        {/each}
      </div>
    {:else if item.kind === 'check'}
      {@const id = `${scope}:${i}`}
      {@const on = flipped[id] ?? item.checked}
      <button role="menuitemcheckbox" aria-checked={on} class="check" onclick={() => pickCheck(item, id)}>
        <span>{item.label}</span><span class="box" class:on aria-hidden="true"></span>
      </button>
    {:else if item.kind === 'submenu'}
      <button
        role="menuitem" class="submenu" class:open={sub?.index === i} aria-haspopup="menu" aria-expanded={sub?.index === i} data-sub={i}
        onclick={(e) => openSub(i, e.currentTarget, e.detail === 0)} onpointerenter={(e) => hover(e, i, true)}
      >
        <span class="label"><span>{item.label}</span>{#if item.detail}<span class="detail">{item.detail}</span>{/if}</span>
        <span class="chevron" aria-hidden="true"></span>
      </button>
    {:else}
      <button role="menuitem" class:danger={item.danger} disabled={item.disabled} onclick={() => pick(item)}>{item.label}</button>
    {/if}
  {/each}
{/snippet}

{#if open}
  <div bind:this={panel} class="menu" class:still role="menu" aria-label={label} tabindex="-1" style:top="{pos.top}px" style:left="{pos.left}px"
    style:transform-origin={origin} onkeydown={(e) => key(e, panel, false)} onpointerover={(e) => { if (!(e.target as HTMLElement).closest('.submenu')) hover(e, -1, false); }} out:leave={{ instant: still }}>
    {@render list(items, 'root')}
  </div>
  {#if sub}
    <div
      bind:this={subPanel} class="menu sub" class:still role="menu" aria-label={sub.item.label} tabindex="-1" style:top="{subPos.top}px" style:left="{subPos.left}px"
      onkeydown={(e) => key(e, subPanel, true)} onpointerenter={() => clearTimeout(subTimer)} out:leave={{ instant: still }}
    >
      {@render list(sub.item.items, `sub${sub.index}`)}
    </div>
  {/if}
{/if}

<style>
  .menu {
    position: fixed; z-index: 950; display: grid; min-width: 11rem; padding: var(--space-3);
    background: var(--surface-1); border: 1px solid var(--border-default); border-radius: var(--radius-md);
    box-shadow: var(--shadow-popover); animation: pop var(--dur-popover) var(--ease-out);
  }
  button {
    min-height: 2rem; padding: 0 var(--space-3); border: 0; border-radius: var(--radius-xs);
    background: none; color: var(--text-normal); font: 500 var(--text-sm) var(--font-sans); text-align: left;
  }
  button:focus-visible { background: var(--surface-5); color: var(--text-strong); outline: none; }
  @media (hover: hover) { button:hover:not(:disabled) { background: var(--surface-5); color: var(--text-strong); } }
  button.danger { color: var(--danger); }
  button.danger:focus-visible { background: var(--danger-fill); color: var(--on-danger); }
  @media (hover: hover) { button.danger:hover:not(:disabled) { background: var(--danger-fill); color: var(--on-danger); } }
  button:disabled { opacity: 0.5; }
  .submenu { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); }
  .submenu.open { background: var(--surface-5); color: var(--text-strong); }
  .submenu .label { display: grid; padding: var(--space-2) 0; }
  .detail { color: var(--text-secondary); font-size: var(--text-xs); }
  /* The arrow, drawn with two borders like the tick, so the package needs no icon set. */
  .chevron { flex: none; width: 0.4rem; height: 0.4rem; border: solid currentColor; border-width: 2px 2px 0 0; rotate: 45deg; }
  .sub { min-width: 12rem; }
  .check { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); }
  .box { flex: none; width: 1.125rem; height: 1.125rem; border: 2px solid var(--text-secondary); border-radius: var(--radius-xs); }
  .box.on { position: relative; border-color: var(--accent); background: var(--accent); }
  /* The tick, drawn with two borders so the package needs no icon set. */
  .box.on::after {
    content: ''; position: absolute; left: 0.3rem; top: 0.05rem; width: 0.3rem; height: 0.6rem;
    border: solid var(--on-accent); border-width: 0 2px 2px 0; rotate: 45deg;
  }
  .row { display: flex; gap: var(--space-1); justify-content: space-between; }
  .chip { display: grid; place-items: center; flex: 1 1 0; min-width: 2.25rem; height: 2.25rem; padding: 0; border-radius: var(--radius-md); background: var(--surface-3); font-size: 1.25rem; line-height: 1; text-align: center; }
  .chip img { width: 1.375rem; height: 1.375rem; object-fit: contain; }
  .separator { height: 1px; margin: var(--space-2) var(--space-3); background: var(--border-default); }
  .still { animation: none; }
  @keyframes pop { from { opacity: 0; scale: calc(1 - 0.02 * var(--motion)); } }
</style>
