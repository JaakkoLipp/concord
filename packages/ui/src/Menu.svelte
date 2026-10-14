<script lang="ts">
  /**
   * A menu of actions, opened from a button or at the pointer for a right-click or long press. Arrow keys,
   * Home and End move, Enter or Space picks, Escape or Tab closes, as the ARIA menu pattern describes.
   * Checkboxes toggle and close like actions; a slider keeps the menu open and moves with Left and Right.
   */
  import { tick } from 'svelte';
  import MenuSlider from './MenuSlider.svelte';
  import type { MenuAction, MenuCheck, MenuItem } from './types.ts';
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

  function place() {
    if (!panel) return;
    const p = panel.getBoundingClientRect();
    const gap = 8;
    let top = 0;
    let left = 0;
    if (at) {
      top = at.y;
      left = at.x;
    } else if (anchor) {
      const a = anchor.getBoundingClientRect();
      top = a.bottom + 4;
      left = a.right - p.width;
    }
    top = Math.max(gap, Math.min(window.innerHeight - p.height - gap, top));
    left = Math.max(gap, Math.min(window.innerWidth - p.width - gap, left));
    pos = { top, left };
  }

  const buttons = () => [...(panel?.querySelectorAll<HTMLElement>('button:not(:disabled), input') ?? [])];

  function key(e: KeyboardEvent) {
    const list = buttons();
    const i = list.indexOf(document.activeElement as HTMLElement);
    const next = e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : null;
    if (next !== null) {
      e.preventDefault();
      list[(next + list.length) % list.length]?.focus();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      onclose();
    }
  }

  function pick(item: MenuAction | MenuCheck) {
    onclose();
    item.onselect();
  }

  $effect(() => {
    if (!open) return;
    const returnTo = document.activeElement as HTMLElement | null;
    void tick().then(() => {
      place();
      buttons()[0]?.focus();
    });
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onclose(); } };
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panel && !panel.contains(t) && !anchor?.contains(t)) onclose();
    };
    window.addEventListener('keydown', esc, true);
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('resize', onclose);
    return () => {
      window.removeEventListener('keydown', esc, true);
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('resize', onclose);
      if (returnTo?.isConnected) returnTo.focus();
    };
  });
</script>

{#if open}
  <div bind:this={panel} class="menu" role="menu" aria-label={label} tabindex="-1" style:top="{pos.top}px" style:left="{pos.left}px" onkeydown={key}>
    {#each items as item, i (i)}
      {#if item === 'separator'}
        <div class="separator" role="separator"></div>
      {:else if item.kind === 'range'}
        <MenuSlider {item} />
      {:else if item.kind === 'check'}
        <button role="menuitemcheckbox" aria-checked={item.checked} class="check" onclick={() => pick(item)}>
          <span>{item.label}</span><span class="box" class:on={item.checked} aria-hidden="true"></span>
        </button>
      {:else}
        <button role="menuitem" class:danger={item.danger} disabled={item.disabled} onclick={() => pick(item)}>{item.label}</button>
      {/if}
    {/each}
  </div>
{/if}

<style>
  .menu {
    position: fixed; z-index: 950; display: grid; min-width: 11rem; padding: var(--space-3);
    background: var(--surface-1); border: 1px solid var(--border-default); border-radius: var(--radius-lg);
    box-shadow: var(--shadow-popover); animation: pop var(--dur-popover) var(--ease-out);
  }
  button {
    min-height: 2rem; padding: 0 var(--space-3); border: 0; border-radius: var(--radius-xs);
    background: none; color: var(--text-normal); font: 500 var(--text-sm) var(--font-sans); text-align: left;
  }
  button:hover:not(:disabled), button:focus-visible { background: var(--surface-5); color: var(--text-strong); outline: none; }
  button.danger { color: var(--danger); }
  button.danger:hover:not(:disabled), button.danger:focus-visible { background: var(--danger-fill); color: var(--on-danger); }
  button:disabled { opacity: 0.5; }
  .check { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); }
  .box { flex: none; width: 1.125rem; height: 1.125rem; border: 2px solid var(--text-secondary); border-radius: var(--radius-xs); }
  .box.on { position: relative; border-color: var(--accent); background: var(--accent); }
  /* The tick, drawn with two borders so the package needs no icon set. */
  .box.on::after {
    content: ''; position: absolute; left: 0.3rem; top: 0.05rem; width: 0.3rem; height: 0.6rem;
    border: solid var(--on-accent); border-width: 0 2px 2px 0; rotate: 45deg;
  }
  .separator { height: 1px; margin: var(--space-2) var(--space-3); background: var(--border-default); }
  @keyframes pop { from { opacity: 0; transform: scale(0.98); } }
</style>
