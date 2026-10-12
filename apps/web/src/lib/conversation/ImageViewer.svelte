<script lang="ts">
  import { IconButton } from '@concord/ui';
  import X from '@lucide/svelte/icons/x';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import { m } from '$lib/i18n/index.ts';
  import { viewer } from '$lib/view/viewer.svelte.ts';

  let dialog = $state<HTMLDialogElement | null>(null);
  $effect(() => {
    if (viewer.current && dialog && !dialog.open) dialog.showModal();
    if (!viewer.current && dialog?.open) dialog.close();
  });
</script>

<dialog bind:this={dialog} class="viewer" aria-label={m.conversation.imageViewer} onclose={() => viewer.close()} onclick={(e) => { if (e.target === dialog) viewer.close(); }}>
  {#if viewer.current}
    <img src={viewer.current.src} alt={viewer.current.alt} width={viewer.current.width} height={viewer.current.height} />
    <div class="bar">
      {#if viewer.current.original}
        <a class="open" href={viewer.current.original} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} />{m.conversation.openOriginal}</a>
      {/if}
      <IconButton label={m.conversation.close} onclick={() => viewer.close()}><X /></IconButton>
    </div>
  {/if}
</dialog>

<style>
  .viewer {
    max-width: 100vw; max-height: 100dvh; width: 100vw; height: 100dvh; margin: 0; padding: var(--space-8);
    border: 0; background: transparent; display: none; place-items: center;
  }
  .viewer[open] { display: grid; }
  .viewer::backdrop { background: var(--scrim); }
  img { max-width: min(100%, 90vw); max-height: 85dvh; width: auto; height: auto; object-fit: contain; border-radius: var(--radius-md); }
  .bar { position: fixed; top: var(--space-5); right: var(--space-5); display: flex; gap: var(--space-3); align-items: center; }
  .open { display: inline-flex; gap: var(--space-2); align-items: center; color: var(--text-strong); font: 500 var(--text-sm) var(--font-sans); }
</style>
