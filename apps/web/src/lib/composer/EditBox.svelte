<script lang="ts">
  /** Inline editing of a sent message (m2a-plan.md task 3): Enter saves, Escape cancels, as on Discord. */
  import { untrack } from 'svelte';
  import type { Store } from '@concord/domain';
  import { m } from '$lib/i18n/index.ts';
  import type { ComposerEditor } from './editor.ts';
  import { byteLength, outgoing } from './text.ts';
  import { labeller } from './tokens.ts';

  interface Props { text: string; store: Store; server: string | undefined; onsave: (text: string) => void; oncancel: () => void }
  let { text, store, server, onsave, oncancel }: Props = $props();
  let host = $state<HTMLDivElement>();
  let editor: ComposerEditor | null = null;
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const limit = $derived(store.node?.limits.messageLength ?? 2000);

  function save() {
    const out = outgoing(editor?.text() ?? '');
    if (byteLength(out) > limit) return;
    onsave(out);
  }

  $effect(() => {
    const el = host;
    if (!el) return;
    let cancelled = false;
    void import('./editor.ts').then(({ createEditor }) => {
      if (cancelled) return;
      untrack(() => {
        editor = createEditor(el, {
          draft: null, text, placeholder: '', touch: false, label: labeller(store, () => server),
          onChange: () => {}, onSend: save, onEscape: () => (oncancel(), true),
        });
        editor.focus();
      });
    });
    return () => {
      cancelled = true;
      editor?.destroy();
      editor = null;
    };
  });
</script>

<div class="edit">
  <div class="box" bind:this={host}></div>
  <p class="hint">
    {#if touch}
      <button onclick={oncancel}>{m.actions.cancel}</button> <button onclick={save}>{m.actions.save}</button>
    {:else}
      {m.actions.editHint}
    {/if}
  </p>
</div>

<style>
  .edit { margin: var(--space-1) 0; }
  .box { padding: 0 var(--space-4); border-radius: var(--radius-md); background: var(--surface-2); }
  .box :global(.cm-content) { padding: var(--space-3) 0; }
  .box :global(.cm-token) { padding: 0 2px; border-radius: var(--radius-xs); background: var(--accent-subtle); color: var(--text-strong); font-weight: 500; }
  .box :global(.cm-token-emoji) { display: inline-block; width: 1.375em; height: 1.375em; vertical-align: -0.3em; object-fit: contain; }
  .hint { margin: var(--space-1) 0 0; color: var(--text-secondary); font: var(--text-xs) var(--font-sans); }
  .hint button { padding: 0; margin-right: var(--space-3); border: 0; background: none; color: var(--link); font: inherit; cursor: pointer; }
</style>
