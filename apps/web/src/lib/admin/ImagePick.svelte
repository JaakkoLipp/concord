<script lang="ts">
  /**
   * Choose an image within an upload limit, with Change and Remove. The parent keeps the choice: a new file,
   * 'remove', or null for no change.
   */
  import { Button } from '@concord/ui';
  import { m } from '$lib/i18n/index.ts';

  export type ImageChoice = { file: File; url: string } | 'remove' | null;
  interface Props {
    label: string;
    value: ImageChoice;
    /** The image shown when nothing new is chosen. */
    current?: string | null | undefined;
    /** Bytes. */
    limit: number;
    shape?: 'round' | 'wide';
  }
  let { label, value = $bindable(), current = null, limit, shape = 'round' }: Props = $props();
  let error = $state<string | undefined>();
  const shown = $derived(value === 'remove' ? null : value ? value.url : current);

  function choose(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { error = m.admin.imageOnly; return; }
    if (file.size > limit) { error = m.admin.tooLarge(Math.round(limit / 100_000) / 10); return; }
    error = undefined;
    release(value);
    value = { file, url: URL.createObjectURL(file) };
  }
  function release(v: ImageChoice) { if (v && v !== 'remove') URL.revokeObjectURL(v.url); }
  $effect(() => () => release(value));
</script>

<div class="pick">
  <span class="label">{label}</span>
  <div class="row">
    <div class="preview {shape}">{#if shown}<img src={shown} alt="" />{/if}</div>
    <div class="buttons">
      <label class="upload"><input type="file" accept="image/*" onchange={choose} aria-label={label} />{shown ? m.admin.change : m.admin.chooseImage}</label>
      {#if shown}<Button size="sm" variant="ghost" onclick={() => { release(value); value = current ? 'remove' : null; }}>{m.admin.remove}</Button>{/if}
    </div>
  </div>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</div>

<style>
  .pick { display: grid; gap: var(--space-3); }
  .label { color: var(--text-secondary); font: 700 var(--text-xs) var(--font-sans); letter-spacing: 0.02em; text-transform: uppercase; }
  .row { display: flex; align-items: center; gap: var(--space-4); }
  .preview { flex: none; overflow: hidden; background: var(--surface-3); }
  .preview img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .round { width: 4rem; height: 4rem; border-radius: var(--radius-lg); }
  .wide { width: 10rem; height: 4rem; border-radius: var(--radius-md); }
  .buttons { display: flex; gap: var(--space-3); }
  .upload {
    position: relative; display: inline-flex; align-items: center; min-height: 2rem; padding: 0 var(--space-4); border-radius: var(--radius-md);
    background: var(--accent); color: var(--on-accent); font: 500 var(--text-sm) var(--font-sans); cursor: pointer;
  }
  @media (hover: hover) { .upload:hover { background: var(--accent-hover); } }
  .upload:focus-within { outline: 2px solid var(--accent); outline-offset: 2px; }
  .upload input { position: absolute; width: 1px; height: 1px; opacity: 0; }
  .error { margin: 0; color: var(--danger); font: var(--text-sm) var(--font-sans); }
</style>
