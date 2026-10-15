<script lang="ts">
  /**
   * A floating panel anchored to an element. Closes on Escape and outside clicks, takes focus when it
   * opens and gives it back when it closes (client.md section 11). It grows from its anchor and fades out on
   * close, except when opened from the keyboard.
   */
  import type { Snippet } from 'svelte';
  import { tick } from 'svelte';
  import { fromKeyboard, leave } from './motion.ts';

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
  let origin = $state('top left');
  let still = $state(false);

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
    // It grows from the middle of the anchor's facing edge, measured after clamping.
    const x = side === 'right' ? a.right : side === 'left' ? a.left : a.left + a.width / 2;
    const y = side === 'bottom' ? a.bottom : side === 'top' ? a.top : a.top + a.height / 2;
    origin = `${Math.round(x - left)}px ${Math.round(y - top)}px`;
  }

  $effect(() => {
    if (!open) return;
    const returnTo = document.activeElement as HTMLElement | null;
    still = fromKeyboard();
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
  <div bind:this={panel} class="popover" class:still role="dialog" aria-label={label} style:top="{pos.top}px" style:left="{pos.left}px"
    style:transform-origin={origin} out:leave={{ instant: still }}>
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
  .still { animation: none; }
  @keyframes pop { from { opacity: 0; scale: calc(1 - 0.02 * var(--motion)); } }
</style>
