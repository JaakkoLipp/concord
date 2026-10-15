<script lang="ts">
  import { dialogLeave, IconButton, settle } from '@concord/ui';
  import X from '@lucide/svelte/icons/x';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import { m } from '$lib/i18n/index.ts';
  import { viewer } from '$lib/view/viewer.svelte.ts';

  let dialog = $state<HTMLDialogElement | null>(null);
  // It fades in, and fades out keeping the image, closing when that has run (client.md section 9).
  $effect(() => {
    if (!viewer.current || !dialog) return;
    settle(dialog);
    if (!dialog.open) dialog.showModal();
  });
  function closed() {
    if (viewer.current || !dialog) return;
    dialog.close();
    settle(dialog);
  }
</script>

<dialog bind:this={dialog} class="viewer" aria-label={m.conversation.imageViewer} oncancel={(e) => { e.preventDefault(); viewer.close(); }}
  onclose={() => viewer.close()} onclick={(e) => { if (e.target === dialog) viewer.close(); }}>
  {#if viewer.current}
    <div class="content" out:dialogLeave={dialog} onoutroend={closed}>
    <img src={viewer.current.src} alt={viewer.current.alt} width={viewer.current.width} height={viewer.current.height} />
    <div class="bar">
      {#if viewer.current.original}
        <a class="open" href={viewer.current.original} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} />{m.conversation.openOriginal}</a>
      {/if}
      <IconButton label={m.conversation.close} onclick={() => viewer.close()}><X /></IconButton>
    </div>
    </div>
  {/if}
</dialog>

<style>
  .viewer {
    max-width: 100vw; max-height: 100dvh; width: 100vw; height: 100dvh; margin: 0; padding: var(--space-8);
    border: 0; background: transparent; display: none; place-items: center;
  }
  .viewer[open] { display: grid; animation: viewer-in var(--dur-modal) var(--ease-out); }
  .viewer::backdrop { background: var(--scrim); }
  .viewer[open]::backdrop { animation: fade-in var(--dur-modal) var(--ease-out); }
  /* It fills the dialog, so clicks beside the image pass through to the dialog, which closes on them. */
  .content { display: grid; place-items: center; width: 100%; height: 100%; pointer-events: none; }
  .content > * { pointer-events: auto; }
  @keyframes viewer-in { from { opacity: 0; scale: calc(1 - 0.02 * var(--motion)); } }
  @keyframes fade-in { from { opacity: 0; } }
  img { max-width: min(100%, 90vw); max-height: 85dvh; width: auto; height: auto; object-fit: contain; border-radius: var(--radius-md); }
  .bar { position: fixed; top: var(--space-5); right: var(--space-5); display: flex; gap: var(--space-3); align-items: center; }
  .open { display: inline-flex; gap: var(--space-2); align-items: center; color: var(--text-strong); font: 500 var(--text-sm) var(--font-sans); }
</style>
