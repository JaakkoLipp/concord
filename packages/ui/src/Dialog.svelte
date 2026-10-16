<script lang="ts">
  /**
   * A modal dialog on the native `<dialog>`, which traps focus and closes on Escape. `actions` renders the
   * button row at the bottom. It fades and grows slightly in, and fades out keeping its content (client.md section 9).
   */
  import type { Snippet } from 'svelte';
  import { dialogLeave, settle } from './motion.ts';

  /** `still` skips the enter animation, for dialogs opened from the keyboard (client.md section 9, rule 2). */
  interface Props { open: boolean; title: string; onclose: () => void; children?: Snippet; actions?: Snippet; width?: string; still?: boolean }
  let { open, title, onclose, children, actions, width = '28rem', still = false }: Props = $props();
  let dialog = $state<HTMLDialogElement>();
  const uid = $props.id();

  $effect(() => {
    if (!dialog) return;
    if (open) {
      settle(dialog);
      if (!dialog.open) dialog.showModal();
    }
  });
  /** The content's exit has run: the dialog closes now, unless it was opened again meanwhile. */
  function closed() {
    if (open || !dialog) return;
    dialog.close();
    settle(dialog);
  }
</script>

<!-- The close event comes a moment after closing: if the dialog has opened again for something else by then, it isn't a close. -->
<!-- Escape asks the owner to close, so it gets the same exit as the buttons. -->
<dialog bind:this={dialog} class:still aria-labelledby="dialog-{uid}" style:--dialog-w={width}
  oncancel={(e) => { e.preventDefault(); onclose(); }} onclose={() => { if (open && !dialog?.open) onclose(); }}>
  {#if open}
    <div out:dialogLeave={dialog} onoutroend={closed}>
      <h2 id="dialog-{uid}">{title}</h2>
      {#if children}<div class="body">{@render children()}</div>{/if}
      {#if actions}<div class="actions">{@render actions()}</div>{/if}
    </div>
  {/if}
</dialog>

<style>
  dialog {
    width: min(var(--dialog-w), calc(100vw - 2 * var(--space-5))); padding: var(--space-6); border: 1px solid var(--border-default);
    border-radius: var(--radius-lg); background: var(--surface-1); color: var(--text-normal); box-shadow: var(--shadow-popover);
  }
  dialog::backdrop { background: var(--scrim); }
  dialog[open]:not(.still) { animation: dialog-in var(--dur-modal) var(--ease-out); }
  dialog[open]:not(.still)::backdrop { animation: fade-in var(--dur-modal) var(--ease-out); }
  @keyframes dialog-in { from { opacity: 0; scale: calc(1 - 0.02 * var(--motion)); } }
  @keyframes fade-in { from { opacity: 0; } }
  h2 { margin: 0 0 var(--space-4); color: var(--text-strong); font: 700 var(--text-lg) var(--font-sans); }
  .body { font: var(--text-md) var(--font-sans); }
  .body :global(p) { margin: 0 0 var(--space-4); }
  .actions { display: flex; justify-content: flex-end; gap: var(--space-3); margin-top: var(--space-5); }
</style>
