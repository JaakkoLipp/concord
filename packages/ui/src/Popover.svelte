<script lang="ts">
  /**
   * A floating panel anchored to an element. Closes on Escape and outside clicks, takes focus when it
   * opens and gives it back when it closes (client.md section 11).
   */
  import type { Snippet } from 'svelte';
  import { tick } from 'svelte';

  interface Props {
    anchor: HTMLElement | null;
    open: boolean;
    onclose: () => void;
    side?: 'right' | 'left' | 'bottom' | 'top';
    label: string;
    children: Snippet;
  }
  let { anchor, open, onclose, side = 'right', label, children }: Props = $props();
  let panel = $state<HTMLDivElement | null>(null);
  let pos = $state({ top: 0, left: 0 });

  function place() {
    if (!anchor || !panel) return;
    const a = anchor.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    const gap = 8;
    let top = side === 'bottom' ? a.bottom + gap : side === 'top' ? a.top - p.height - gap : a.top;
    let left = side === 'right' ? a.right + gap : side === 'left' ? a.left - p.width - gap : a.left;
    top = Math.max(gap, Math.min(window.innerHeight - p.height - gap, top));
    left = Math.max(gap, Math.min(window.innerWidth - p.width - gap, left));
    pos = { top, left };
  }

  $effect(() => {
    if (!open) return;
    const returnTo = document.activeElement as HTMLElement | null;
    void tick().then(() => {
      place();
      panel?.querySelector<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])')?.focus();
    });
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onclose(); } };
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panel && !panel.contains(t) && !anchor?.contains(t)) onclose();
    };
    window.addEventListener('keydown', key, true);
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('resize', place);
      returnTo?.focus?.();
    };
  });
</script>

{#if open}
  <div bind:this={panel} class="popover" role="dialog" aria-label={label} style:top="{pos.top}px" style:left="{pos.left}px">
    {@render children()}
  </div>
{/if}

<style>
  .popover {
    position: fixed; z-index: 900;
    background: var(--surface-1); border: 1px solid var(--border-default); border-radius: var(--radius-lg);
    box-shadow: var(--shadow-popover);
    animation: pop var(--dur-popover) var(--ease-out);
  }
  @keyframes pop { from { opacity: 0; transform: scale(0.98); } }
</style>
