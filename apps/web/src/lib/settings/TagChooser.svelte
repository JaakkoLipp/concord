<script lang="ts">
  /**
   * Which server tag to wear, or none (m4.5-plan.md task 10): any tag of a server this account is in. Shown only
   * while one of those servers has a tag.
   */
  import type { Session } from '@concord/domain';
  import { m } from '$lib/i18n/index.ts';
  import { app } from '$lib/session/app.svelte.ts';
  import { tagChoices, tags } from '$lib/layer/tags.svelte.ts';
  import { customEmojiUrl } from '$lib/markdown/emoji.ts';
  import { toasts } from '$lib/view/toast.svelte.ts';

  let { session }: { session: Session } = $props();
  const t = m.settings.tag;
  const choices = $derived(tagChoices(session.store));
  const worn = $derived(session.store.selfId ? tags.worn.get(session.store.selfId)?.server ?? null : null);
  let busy = $state(false);

  async function choose(server: string | null) {
    if (!app.layer || busy || server === worn) return;
    busy = true;
    try {
      await app.layer.wearTag(server);
      await tags.refresh();
    } catch {
      toasts.show(t.failed);
    } finally {
      busy = false;
    }
  }
</script>

{#if choices.length}
  <section class="tags" aria-labelledby="tag-heading">
    <h2 id="tag-heading">{t.heading}</h2>
    <p class="help">{t.help}</p>
    <div class="list" role="radiogroup" aria-labelledby="tag-heading" aria-busy={busy}>
      <button type="button" role="radio" aria-checked={worn === null} class:on={worn === null} onclick={() => choose(null)}>{t.none}</button>
      {#each choices as c (c.server)}
        <button type="button" role="radio" aria-checked={worn === c.server} class:on={worn === c.server} onclick={() => choose(c.server)}>
          <span class="tag"><img src={customEmojiUrl(c.emoji)} alt="" />{c.tag}</span>
          <span class="server">{session.store.servers.get(c.server)?.name ?? ''}</span>
        </button>
      {/each}
    </div>
  </section>
{/if}

<style>
  .tags { display: grid; gap: var(--space-3); margin-top: var(--space-10); }
  h2 { margin: 0; color: var(--text-strong); font: 700 var(--text-md) var(--font-sans); }
  .help { margin: 0; color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  .list { display: grid; gap: var(--space-2); }
  .list button {
    display: flex; align-items: center; gap: var(--space-3); min-height: 2.75rem; padding: var(--space-2) var(--space-4);
    border: 1px solid var(--border-default); border-radius: var(--radius-md); background: var(--surface-1); color: var(--text-normal); text-align: left;
    font: 500 var(--text-sm) var(--font-sans);
  }
  .list button.on { border-color: var(--accent); background: var(--surface-3); color: var(--text-strong); }
  @media (hover: hover) { .list button:hover { background: var(--surface-3); } }
  .tag { display: inline-flex; align-items: center; gap: var(--space-1); height: 1.125rem; padding: 0 var(--space-2) 0 var(--space-1); border-radius: var(--radius-xs); background: var(--surface-5); color: var(--text-strong); font: 700 var(--text-xs) var(--font-sans); }
  .tag img { width: 0.875rem; height: 0.875rem; }
  .server { color: var(--text-secondary); }
</style>
