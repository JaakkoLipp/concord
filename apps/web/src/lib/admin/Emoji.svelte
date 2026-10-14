<script lang="ts">
  /**
   * A server's custom emoji (m2c-plan.md task 7): upload with the name filled from the file, slots left, and
   * each emoji with its name editable in place, its uploader and Delete. Limits are checked before uploading.
   */
  import { Button, IconButton, TextField } from '@concord/ui';
  import type { Session } from '@concord/domain';
  import Trash from '@lucide/svelte/icons/trash-2';
  import { m } from '$lib/i18n/index.ts';
  import { customEmojiUrl } from '$lib/markdown/emoji.ts';
  import { confirm } from '$lib/view/confirm.svelte.ts';
  import { toasts } from '$lib/view/toast.svelte.ts';

  let { session, server }: { session: Session; server: string } = $props();
  const store = $derived(session.store);
  const max = $derived(store.node?.serverLimits.emoji ?? 100);
  const limit = $derived(store.node?.uploadLimits.emojis ?? 500_000);
  const list = $derived([...store.emojis.values()].filter((e) => e.parent.type === 'server' && e.parent.id === server).sort((a, b) => (a.id < b.id ? 1 : -1)));
  const NAME = /^[a-z0-9_]{1,32}$/;

  let file = $state<{ file: File; url: string } | null>(null);
  let name = $state('');
  let error = $state<string | undefined>();
  let busy = $state(false);
  let editing = $state<Record<string, string>>({});

  /** A name in the allowed form, from a file name. */
  const fromFile = (f: string) => f.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32);

  function choose(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) { error = m.admin.imageOnly; return; }
    if (f.size > limit) { error = m.admin.tooLarge(Math.round(limit / 100_000) / 10); return; }
    error = undefined;
    if (file) URL.revokeObjectURL(file.url);
    file = { file: f, url: URL.createObjectURL(f) };
    name = fromFile(f.name);
  }
  $effect(() => () => { if (file) URL.revokeObjectURL(file.url); });

  async function upload() {
    if (!file || !NAME.test(name) || busy) return;
    busy = true;
    try {
      const e = await session.admin.createEmoji(server, file.file, name);
      URL.revokeObjectURL(file.url);
      file = null;
      name = '';
      toasts.show(m.admin.emoji.added(e.name), 'info');
    } catch {
      toasts.show(m.admin.emoji.failed);
    } finally {
      busy = false;
    }
  }

  async function rename(id: string, before: string) {
    const next = editing[id];
    if (next === undefined) return;
    const { [id]: _, ...rest } = editing;
    editing = rest;
    if (next === before) return;
    if (!NAME.test(next)) return toasts.show(m.admin.emoji.nameError);
    try {
      await session.admin.renameEmoji(id, next);
    } catch {
      toasts.show(m.admin.emoji.renameFailed);
    }
  }

  async function remove(id: string, n: string) {
    if (!(await confirm.ask({ title: m.admin.emoji.deleteTitle(n), body: m.admin.emoji.deleteBody, confirm: m.admin.emoji.deleteConfirm, danger: true }))) return;
    try {
      await session.admin.deleteEmoji(id);
    } catch {
      toasts.show(m.admin.emoji.deleteFailed);
    }
  }
</script>

<p class="intro">{m.admin.emoji.intro}</p>
<section class="upload" aria-label={m.admin.emoji.upload}>
  {#if list.length >= max}
    <p class="note">{m.admin.emoji.full}</p>
  {:else}
    <div class="row">
      <div class="preview">{#if file}<img src={file.url} alt="" />{/if}</div>
      <label class="pick"><input type="file" accept="image/*" onchange={choose} aria-label={m.admin.emoji.choose} />{m.admin.emoji.choose}</label>
    </div>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    {#if file}
      <TextField label={m.admin.emoji.name} bind:value={name} hint={m.admin.emoji.nameHint} error={name && !NAME.test(name) ? m.admin.emoji.nameError : undefined} />
      <div><Button {busy} disabled={!NAME.test(name)} onclick={upload}>{m.admin.emoji.upload}</Button></div>
    {/if}
  {/if}
  <p class="note">{m.admin.emoji.slots(Math.max(0, max - list.length), max)}</p>
</section>

{#if !list.length}
  <p class="note">{m.admin.emoji.empty}</p>
{:else}
  <ul class="list">
    {#each list as e (e.id)}
      <li class="emoji" data-emoji={e.name}>
        <img src={customEmojiUrl(e.id)} alt=":{e.name}:" width="32" height="32" loading="lazy" />
        <div class="text">
          <span class="colon">:<input class="name" aria-label={m.admin.emoji.rename(e.name)} value={editing[e.id] ?? e.name} maxlength={32}
            oninput={(ev) => (editing = { ...editing, [e.id]: ev.currentTarget.value.toLowerCase() })}
            onkeydown={(ev) => { if (ev.key === 'Enter') ev.currentTarget.blur(); if (ev.key === 'Escape') { const { [e.id]: _, ...rest } = editing; editing = rest; } }}
            onblur={() => rename(e.id, e.name)} aria-invalid={editing[e.id] !== undefined && !NAME.test(editing[e.id]!) ? true : undefined} />:</span>
          <span class="by">{m.admin.emoji.by(store.displayName(e.creator, server))}</span>
        </div>
        <IconButton size="sm" label={m.admin.emoji.delete(e.name)} onclick={() => remove(e.id, e.name)}><Trash /></IconButton>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .intro, .note { margin: 0 0 var(--space-4); color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  .upload { display: grid; gap: var(--space-4); margin-bottom: var(--space-6); padding-bottom: var(--space-5); border-bottom: 1px solid var(--border-subtle); }
  .row { display: flex; align-items: center; gap: var(--space-4); }
  .preview { width: 3rem; height: 3rem; border-radius: var(--radius-md); background: var(--surface-3); overflow: hidden; display: grid; place-items: center; }
  .preview img { max-width: 100%; max-height: 100%; }
  .pick { position: relative; display: inline-flex; align-items: center; min-height: 2rem; padding: 0 var(--space-4); border-radius: var(--radius-md); background: var(--accent); color: var(--on-accent); font: 500 var(--text-sm) var(--font-sans); cursor: pointer; }
  .pick:focus-within { outline: 2px solid var(--accent); outline-offset: 2px; }
  .pick input { position: absolute; width: 1px; height: 1px; opacity: 0; }
  .error { margin: 0; color: var(--danger); font: var(--text-sm) var(--font-sans); }
  .list { display: grid; gap: var(--space-1); margin: 0; padding: 0; list-style: none; }
  .emoji { display: flex; align-items: center; gap: var(--space-4); padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); }
  .emoji:hover { background: var(--hover-overlay); }
  .emoji img { width: 2rem; height: 2rem; object-fit: contain; }
  .text { flex: 1; display: grid; gap: 2px; min-width: 0; }
  .colon { display: flex; align-items: center; color: var(--text-secondary); font: var(--text-md) var(--font-mono); }
  .name { min-width: 0; width: 100%; max-width: 20rem; padding: 2px var(--space-1); border: 1px solid transparent; border-radius: var(--radius-xs); background: none; color: var(--text-strong); font: inherit; }
  .name:hover { border-color: var(--border-control); }
  .name:focus-visible { outline: none; border-color: var(--accent); background: var(--surface-0); }
  .name[aria-invalid='true'] { border-color: var(--danger); }
  .by { color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
</style>
