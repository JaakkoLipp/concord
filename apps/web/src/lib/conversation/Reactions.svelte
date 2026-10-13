<script lang="ts">
  /**
   * Reaction chips (m2a-plan.md task 4). Clicking one toggles this account's reaction, and hovering shows
   * who reacted. The add button after the chips opens the picker in reaction mode.
   */
  import type { Store } from '@concord/domain';
  import { tooltip } from '@concord/ui';
  import SmilePlus from '@lucide/svelte/icons/smile-plus';
  import { customEmojiUrl, twemojiUrl } from '$lib/markdown/emoji.ts';
  import { m } from '$lib/i18n/index.ts';

  interface Props {
    reactions: Record<string, string[]>; store: Store; server: string | undefined;
    canReact?: boolean; ontoggle?: ((emoji: string) => void) | undefined; onadd?: ((anchor: HTMLElement) => void) | undefined;
  }
  let { reactions, store, server, canReact = false, ontoggle, onadd }: Props = $props();
  const CUSTOM = /^[0-9A-HJKMNP-TV-Z]{26}$/;
  const entries = $derived(Object.entries(reactions).filter(([, users]) => users.length));
  /** Emoji newer than our Twemoji images show as text, as in messages. */
  let failed = $state<Record<string, boolean>>({});
  const who = (users: string[]) => users.slice(0, 6).map((u) => store.displayName(u, server)).join(', ') + (users.length > 6 ? ` +${users.length - 6}` : '');
</script>

<div class="reactions">
  {#each entries as [emoji, users] (emoji)}
    {@const mine = !!store.selfId && users.includes(store.selfId)}
    {@const name = CUSTOM.test(emoji) ? `:${store.emojis.get(emoji)?.name ?? emoji}:` : emoji}
    <button class="chip" class:mine use:tooltip={m.conversation.reactedWith(who(users), name)} aria-pressed={mine}
      aria-label={m.conversation.reactionLabel(name, users.length, mine)} disabled={!ontoggle || (!mine && !canReact)} onclick={() => ontoggle?.(emoji)}>
      {#if failed[emoji]}<span class="text-emoji">{emoji}</span>{:else}<img src={CUSTOM.test(emoji) ? customEmojiUrl(emoji) : twemojiUrl(emoji)} alt="" draggable="false" onerror={() => (failed = { ...failed, [emoji]: true })} />{/if}
      <span class="count">{users.length}</span>
    </button>
  {/each}
  {#if canReact && onadd}
    <button class="chip add" aria-label={m.emoji.addReaction} use:tooltip={m.emoji.addReaction} onclick={(e) => onadd(e.currentTarget)}><SmilePlus size={18} /></button>
  {/if}
</div>

<style>
  .reactions { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-2); }
  .chip {
    display: inline-flex; align-items: center; gap: var(--space-2); min-height: 1.75rem; padding: 0 var(--space-3);
    border: 1px solid transparent; border-radius: var(--radius-md); background: var(--surface-3);
    color: var(--text-secondary); font: 500 var(--text-sm) var(--font-sans); font-variant-numeric: tabular-nums; cursor: pointer;
  }
  .chip:hover:not(:disabled) { border-color: var(--border-control); }
  .chip:disabled { cursor: default; }
  .chip.mine { background: var(--accent-subtle); border-color: var(--accent); color: var(--text-strong); }
  .add { visibility: hidden; color: var(--text-secondary); }
  :global(.message:hover) .add, :global(.message.selected) .add, .add:focus-visible { visibility: visible; }
  .text-emoji { font-size: 1rem; line-height: 1; }
  img { width: 1.125rem; height: 1.125rem; object-fit: contain; }
</style>
