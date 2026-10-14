<script lang="ts">
  /**
   * A modal dialog on the native `<dialog>`, which traps focus and closes on Escape. `actions` renders the
   * button row at the bottom.
   */
  import type { Snippet } from 'svelte';

  interface Props { open: boolean; title: string; onclose: () => void; children?: Snippet; actions?: Snippet; width?: string }
  let { open, title, onclose, children, actions, width = '28rem' }: Props = $props();
  let dialog = $state<HTMLDialogElement>();
  const uid = $props.id();

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  });
</script>

<!-- The close event comes a moment after closing: if the dialog has opened again for something else by then, it isn't a close. -->
<dialog bind:this={dialog} aria-labelledby="dialog-{uid}" style:--dialog-w={width} onclose={() => { if (open && !dialog?.open) onclose(); }}>
  {#if open}
    <h2 id="dialog-{uid}">{title}</h2>
    {#if children}<div class="body">{@render children()}</div>{/if}
    {#if actions}<div class="actions">{@render actions()}</div>{/if}
  {/if}
</dialog>

<style>
  dialog {
    width: min(var(--dialog-w), calc(100vw - 2 * var(--space-5))); padding: var(--space-6); border: 1px solid var(--border-default);
    border-radius: var(--radius-lg); background: var(--surface-1); color: var(--text-normal); box-shadow: var(--shadow-popover);
  }
  dialog::backdrop { background: var(--scrim); }
  h2 { margin: 0 0 var(--space-4); color: var(--text-strong); font: 700 var(--text-lg) var(--font-sans); }
  .body { font: var(--text-md) var(--font-sans); }
  .body :global(p) { margin: 0 0 var(--space-4); }
  .actions { display: flex; justify-content: flex-end; gap: var(--space-3); margin-top: var(--space-5); }
</style>
