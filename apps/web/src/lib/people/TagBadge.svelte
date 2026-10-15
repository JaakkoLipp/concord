<script lang="ts">
  /**
   * A server tag beside a name (m4.5-plan.md task 10): the server's badge emoji and its tag, as on Discord. Clicking
   * it shows which server it's from. Nothing shows for someone not wearing one, or not known to be in its server.
   */
  import type { Id, Store } from '@concord/domain';
  import { Popover } from '@concord/ui';
  import { fileUrl } from '@concord/stoat';
  import { customEmojiUrl } from '$lib/markdown/emoji.ts';
  import { tags } from '$lib/layer/tags.svelte.ts';
  import { m } from '$lib/i18n/index.ts';

  /** `plain` inside another button or link, such as a member list row, where a button can't go. */
  let { store, user, plain = false }: { store: Store; user: Id; plain?: boolean } = $props();
  const tag = $derived(tags.of(store, user));
  const server = $derived(tag ? store.servers.get(tag.server) : undefined);
  let anchor = $state<HTMLButtonElement | null>(null);
  let open = $state(false);
</script>

{#if tag && plain}
  <span class="tag" aria-label={m.tags.label(tag.tag, server?.name ?? '')}><img src={customEmojiUrl(tag.emoji)} alt="" draggable="false" /><span>{tag.tag}</span></span>
{:else if tag}
  <button class="tag" bind:this={anchor} aria-expanded={open} aria-label={m.tags.label(tag.tag, server?.name ?? '')}
    onclick={(e) => { e.stopPropagation(); open = !open; }}>
    <img src={customEmojiUrl(tag.emoji)} alt="" draggable="false" /><span>{tag.tag}</span>
  </button>
  <Popover {anchor} {open} onclose={() => (open = false)} side="top" label={m.tags.label(tag.tag, server?.name ?? '')}>
    <div class="card">
      {#if server?.icon}<img class="icon" src={fileUrl(server.icon, { maxSide: 64 })} alt="" />{/if}
      <div class="text">
        <p class="name">{server?.name ?? ''}</p>
        <p class="sub">{m.tags.from(tag.tag)}</p>
      </div>
    </div>
  </Popover>
{/if}

<style>
  span.tag { cursor: inherit; }
  .tag {
    display: inline-flex; align-items: center; gap: var(--space-1); flex: none; height: 1.125rem; padding: 0 var(--space-2) 0 var(--space-1);
    border: 0; border-radius: var(--radius-xs); background: var(--surface-5); color: var(--text-strong);
    font: 700 var(--text-xs) var(--font-sans); letter-spacing: 0.02em; vertical-align: middle; cursor: pointer;
  }
  @media (hover: hover) { .tag:hover { background: var(--hover-overlay); } }
  .tag img { width: 0.875rem; height: 0.875rem; object-fit: contain; }
  .card { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3) var(--space-4); max-width: 16rem; }
  .icon { width: 2rem; height: 2rem; border-radius: var(--radius-md); }
  .text { display: grid; min-width: 0; }
  .name, .sub { margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .name { color: var(--text-strong); font: 600 var(--text-sm) var(--font-sans); }
  .sub { color: var(--text-secondary); font: var(--text-xs) var(--font-sans); }
</style>
