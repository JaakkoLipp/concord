<script lang="ts">
  import type { Store } from '@concord/domain';
  import { tooltip } from '@concord/ui';
  import { customEmojiUrl, twemojiUrl } from '$lib/markdown/emoji.ts';
  import { m } from '$lib/i18n/index.ts';

  let { reactions, store, server }: { reactions: Record<string, string[]>; store: Store; server: string | undefined } = $props();
  const CUSTOM = /^[0-9A-HJKMNP-TV-Z]{26}$/;
  const entries = $derived(Object.entries(reactions).filter(([, users]) => users.length));
  const who = (users: string[]) => users.slice(0, 6).map((u) => store.displayName(u, server)).join(', ') + (users.length > 6 ? ` +${users.length - 6}` : '');
</script>

<div class="reactions">
  {#each entries as [emoji, users] (emoji)}
    {@const mine = !!store.selfId && users.includes(store.selfId)}
    {@const name = CUSTOM.test(emoji) ? `:${store.emojis.get(emoji)?.name ?? emoji}:` : emoji}
    <span class="chip" class:mine use:tooltip={m.conversation.reactedWith(who(users), name)} role="img" aria-label={m.conversation.reactionLabel(name, users.length, mine)}>
      <img src={CUSTOM.test(emoji) ? customEmojiUrl(emoji) : twemojiUrl(emoji)} alt="" draggable="false" />
      <span class="count">{users.length}</span>
    </span>
  {/each}
</div>

<style>
  .reactions { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-2); }
  .chip {
    display: inline-flex; align-items: center; gap: var(--space-2); min-height: 1.75rem; padding: 0 var(--space-3);
    border: 1px solid transparent; border-radius: var(--radius-md); background: var(--surface-3);
    color: var(--text-secondary); font: 500 var(--text-sm) var(--font-sans); font-variant-numeric: tabular-nums;
  }
  .chip.mine { background: var(--accent-subtle); border-color: var(--accent); color: var(--text-strong); }
  img { width: 1.125rem; height: 1.125rem; object-fit: contain; }
</style>
