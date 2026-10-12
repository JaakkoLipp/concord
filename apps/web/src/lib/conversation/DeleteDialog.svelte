<script lang="ts">
  /** Asks before deleting a message (m2a-plan.md decision 3). Shift+click on delete skips it. */
  import { Button } from '@concord/ui';
  import type { Message } from '@concord/domain';
  import Markdown from '$lib/markdown/Markdown.svelte';
  import { m } from '$lib/i18n/index.ts';

  interface Props { message: Message | null; author: string; onconfirm: () => void; oncancel: () => void }
  let { message, author, onconfirm, oncancel }: Props = $props();
  let dialog = $state<HTMLDialogElement>();

  $effect(() => {
    if (!dialog) return;
    if (message && !dialog.open) dialog.showModal();
    if (!message && dialog.open) dialog.close();
  });
</script>

<dialog bind:this={dialog} aria-labelledby="delete-title" onclose={() => { if (message) oncancel(); }}>
  {#if message}
    <h2 id="delete-title">{m.actions.deleteTitle}</h2>
    <p>{m.actions.deleteBody}</p>
    <div class="preview">
      <strong>{author}</strong>
      {#if message.content}<div class="content"><Markdown source={message.content} /></div>{/if}
    </div>
    <p class="tip">{m.actions.deleteTip}</p>
    <div class="buttons">
      <Button variant="ghost" onclick={oncancel}>{m.actions.cancel}</Button>
      <Button variant="danger" onclick={onconfirm}>{m.actions.delete}</Button>
    </div>
  {/if}
</dialog>

<style>
  dialog {
    width: min(28rem, calc(100vw - 2 * var(--space-5))); padding: var(--space-6); border: 1px solid var(--border-default);
    border-radius: var(--radius-lg); background: var(--surface-1); color: var(--text-normal); box-shadow: var(--shadow-popover);
  }
  dialog::backdrop { background: var(--scrim); }
  h2 { margin: 0 0 var(--space-3); color: var(--text-strong); font: 700 var(--text-lg) var(--font-sans); }
  p { margin: 0 0 var(--space-4); font: var(--text-md) var(--font-sans); }
  .preview { max-height: 12rem; overflow: auto; padding: var(--space-3) var(--space-4); margin-bottom: var(--space-4); border-radius: var(--radius-md); background: var(--surface-2); }
  .preview strong { color: var(--text-strong); font: 500 var(--text-md) var(--font-sans); }
  .content { font: var(--text-md) var(--font-sans); overflow-wrap: anywhere; }
  .tip { color: var(--text-secondary); font: var(--text-xs) var(--font-sans); }
  .buttons { display: flex; justify-content: flex-end; gap: var(--space-3); }
</style>
