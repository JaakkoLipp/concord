<script lang="ts">
  import type { Store } from '@concord/domain';
  import { fadeIn } from '@concord/ui';
  import Inline from '$lib/markdown/Inline.svelte';
  import { parse } from '$lib/markdown/parse.ts';
  import { m } from '$lib/i18n/index.ts';
  import { avatarUrl } from '$lib/view/users.ts';

  let { id, store, server, onjump }: { id: string; store: Store; server: string | undefined; onjump: (id: string) => void } = $props();
  const message = $derived(store.messages.get(id));
  const first = $derived.by(() => {
    const blocks = parse(message?.content ?? '');
    const b = blocks.find((x) => x.t === 'p' || x.t === 'h');
    return b && (b.t === 'p' || b.t === 'h') ? b.c.filter((n) => n.t !== 'br') : [];
  });
</script>

<button class="reply" onclick={() => onjump(id)} aria-label={m.conversation.jumpToReply}>
  <span class="curve" aria-hidden="true"></span>
  {#if message}
    <img use:fadeIn class="avatar" src={avatarUrl(store.users.get(message.author) ?? { id: message.author })} alt="" width="16" height="16" />
    <span class="name" style:--role={server ? store.roleColour(message.author, server) : undefined}>{store.displayName(message.author, server)}</span>
    <span class="snippet">{#if first.length}<Inline nodes={first} />{:else if message.attachments.length}{m.conversation.attachment}{/if}</span>
  {:else}
    <span class="snippet missing">{m.conversation.replyNotLoaded}</span>
  {/if}
</button>

<style>
  .reply {
    position: relative; display: flex; align-items: center; gap: var(--space-2); width: 100%; min-width: 0; margin: 0 0 var(--space-1);
    padding: 0 0 0 calc(var(--avatar-md) + var(--space-5)); background: none; border: 0; text-align: left;
    color: var(--text-secondary); font: var(--text-sm) var(--font-sans);
  }
  .curve {
    position: absolute; left: calc(var(--avatar-md) / 2 + 2px); top: 50%; width: 30px; height: 12px;
    border: 2px solid var(--border-control); border-right: 0; border-bottom: 0; border-top-left-radius: 6px;
  }
  .avatar { width: 16px; height: 16px; border-radius: 50%; flex: none; }
  .name { flex: none; color: var(--text-strong); font-weight: 500; }
  .name[style*='--role'] { background: var(--role); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .snippet { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  @media (hover: hover) { .reply:hover .snippet { color: var(--text-strong); } }
  .missing { font-style: italic; }
</style>
