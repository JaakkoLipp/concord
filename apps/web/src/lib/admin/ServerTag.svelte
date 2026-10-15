<script lang="ts">
  /**
   * A server's tag (m4.5-plan.md task 10): up to 4 letters or digits, with one of the server's custom emoji as its
   * badge. Shown only to someone Stoat lets create servers who holds Manage server here; the layer checks both.
   */
  import type { Session, ServerTag } from '@concord/domain';
  import { Button, TextField } from '@concord/ui';
  import { m } from '$lib/i18n/index.ts';
  import { app } from '$lib/session/app.svelte.ts';
  import { tags } from '$lib/layer/tags.svelte.ts';
  import { customEmojiUrl } from '$lib/markdown/emoji.ts';
  import { toasts } from '$lib/view/toast.svelte.ts';

  let { session, server }: { session: Session; server: string } = $props();
  const t = m.admin.tag;
  const emojis = $derived([...session.store.emojis.values()].filter((e) => e.parent.type === 'server' && e.parent.id === server).sort((a, b) => a.name.localeCompare(b.name)));
  let current = $state<ServerTag | null>(null);
  let draft = $state({ tag: '', emoji: '' });
  let loaded = $state(false);
  let saving = $state(false);

  $effect(() => {
    const layer = app.layer;
    const id = server;
    if (!layer) return;
    let stale = false;
    loaded = false;
    void layer.serverTags([id]).then((r) => {
      if (stale) return;
      current = r[id] ?? null;
      draft = { tag: current?.tag ?? '', emoji: current?.emoji ?? '' };
      loaded = true;
    }, () => { if (!stale) toasts.show(t.loadFailed); });
    return () => { stale = true; };
  });

  const error = $derived(draft.tag && !/^[\p{L}\p{N}]{1,4}$/u.test(draft.tag.trim()) ? t.tagError : undefined);
  const valid = $derived(!!draft.tag.trim() && !error && !!draft.emoji);
  const dirty = $derived(draft.tag.trim() !== (current?.tag ?? '') || draft.emoji !== (current?.emoji ?? ''));

  async function save() {
    if (!app.layer || !valid || saving) return;
    saving = true;
    try {
      current = await app.layer.setServerTag(server, draft.tag.trim(), draft.emoji);
      draft = { tag: current.tag, emoji: current.emoji };
      void tags.refresh();
      toasts.show(m.admin.saved, 'info');
    } catch {
      toasts.show(t.saveFailed);
    } finally {
      saving = false;
    }
  }

  async function disable() {
    if (!app.layer || saving) return;
    saving = true;
    try {
      await app.layer.removeServerTag(server);
      current = null;
      draft = { tag: '', emoji: '' };
      void tags.refresh();
      toasts.show(t.disabled, 'info');
    } catch {
      toasts.show(t.saveFailed);
    } finally {
      saving = false;
    }
  }
</script>

{#if loaded}
  <div class="fields">
    <p class="intro">{t.intro}</p>
    <TextField label={t.tag} bind:value={draft.tag} maxlength={8} error={error} hint={t.tagHint} />
    <fieldset>
      <legend>{t.badge}</legend>
      {#if emojis.length}
        <div class="grid" role="radiogroup" aria-label={t.badge}>
          {#each emojis as e (e.id)}
            <button type="button" role="radio" aria-checked={draft.emoji === e.id} aria-label={`:${e.name}:`} title={`:${e.name}:`} class:on={draft.emoji === e.id}
              onclick={() => (draft.emoji = e.id)}><img src={customEmojiUrl(e.id)} alt="" /></button>
          {/each}
        </div>
      {:else}
        <p class="note">{t.noEmoji}</p>
      {/if}
    </fieldset>
    {#if draft.tag.trim() && draft.emoji && !error}
      <p class="preview">{t.preview}<span class="tag"><img src={customEmojiUrl(draft.emoji)} alt="" />{draft.tag.trim()}</span></p>
    {/if}
    <div class="buttons">
      <Button onclick={save} busy={saving} disabled={!valid || !dirty}>{current ? t.save : t.enable}</Button>
      {#if current}<Button variant="danger" onclick={disable} disabled={saving}>{t.disable}</Button>{/if}
    </div>
  </div>
{/if}

<style>
  .fields { display: grid; gap: var(--space-6); }
  .intro, .note { margin: 0; color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  fieldset { display: grid; gap: var(--space-3); margin: 0; padding: 0; border: 0; }
  legend { margin-bottom: var(--space-3); padding: 0; color: var(--text-secondary); font: 700 var(--text-xs) var(--font-sans); letter-spacing: 0.02em; text-transform: uppercase; }
  .grid { display: flex; flex-wrap: wrap; gap: var(--space-2); }
  .grid button { display: grid; place-items: center; width: 2.5rem; height: 2.5rem; padding: 0; border: 2px solid transparent; border-radius: var(--radius-md); background: var(--surface-3); }
  .grid button.on { border-color: var(--accent); }
  @media (hover: hover) { .grid button:hover { background: var(--surface-5); } }
  .grid img { width: 1.75rem; height: 1.75rem; object-fit: contain; }
  .preview { display: flex; align-items: center; gap: var(--space-3); margin: 0; color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  .tag { display: inline-flex; align-items: center; gap: var(--space-1); height: 1.125rem; padding: 0 var(--space-2) 0 var(--space-1); border-radius: var(--radius-xs); background: var(--surface-5); color: var(--text-strong); font: 700 var(--text-xs) var(--font-sans); }
  .tag img { width: 0.875rem; height: 0.875rem; }
  .buttons { display: flex; gap: var(--space-3); }
</style>
