<script lang="ts">
  /**
   * Who reacted (m4.3-plan.md tasks 4 and N7): every reaction on a message with everyone behind it, read live from
   * the store. Your own can be taken back here, and with Manage messages anyone's, or all of one emoji.
   */
  import { Avatar, Button, Dialog } from '@concord/ui';
  import { Permission, has, type Id, type Session } from '@concord/domain';
  import { customEmojiUrl, twemojiUrl } from '$lib/markdown/emoji.ts';
  import { m } from '$lib/i18n/index.ts';
  import { permissionsIn } from '$lib/view/channels.ts';
  import { reactionsView } from '$lib/view/reactions.svelte.ts';
  import { toasts } from '$lib/view/toast.svelte.ts';
  import { avatarUrl } from '$lib/view/users.ts';

  let { session }: { session: Session } = $props();
  const store = $derived(session.store);
  const CUSTOM = /^[0-9A-HJKMNP-TV-Z]{26}$/;
  const message = $derived(reactionsView.current ? store.messages.get(reactionsView.current.message) : undefined);
  const channel = $derived(message ? store.channels.get(message.channel) : undefined);
  const server = $derived(channel?.kind === 'text' ? channel.server : undefined);
  const manage = $derived(!!channel && has(permissionsIn(store, channel), Permission.ManageMessages));
  const entries = $derived(Object.entries(message?.reactions ?? {}).filter(([, users]) => users.length));
  // The emoji asked for when it opened, until another is picked here.
  let chosen = $derived(reactionsView.current?.emoji);
  const emoji = $derived(entries.some(([e]) => e === chosen) ? chosen : entries[0]?.[0]);
  const users = $derived(entries.find(([e]) => e === emoji)?.[1] ?? []);
  const label = (e: string) => (CUSTOM.test(e) ? `:${store.emojis.get(e)?.name ?? e}:` : e);
  // The message went, or its last reaction did: nothing left to show.
  $effect(() => { if (reactionsView.current && !entries.length) reactionsView.close(); });

  function remove(user: Id) {
    if (!message || !emoji) return;
    const done = user === store.selfId ? session.react(message.channel, message.id, emoji) : session.backend.removeReaction(message.channel, message.id, emoji, user);
    void done.catch(() => toasts.show(m.emoji.reactFailed));
  }
  function removeAll() {
    if (message && emoji) void session.backend.removeReaction(message.channel, message.id, emoji).catch(() => toasts.show(m.emoji.reactFailed));
  }
</script>

<Dialog open={!!reactionsView.current && entries.length > 0} title={m.reactions.title} onclose={() => reactionsView.close()}>
  <div class="tabs" role="tablist">
    {#each entries as [e, list] (e)}
      <button class="tab" role="tab" aria-selected={e === emoji} aria-label={m.conversation.reactionLabel(label(e), list.length, false)} onclick={() => (chosen = e)}>
        <img src={CUSTOM.test(e) ? customEmojiUrl(e) : twemojiUrl(e)} alt="" draggable="false" /><span>{list.length}</span>
      </button>
    {/each}
  </div>
  <ul>
    {#each users as u (u)}
      <li>
        <Avatar src={avatarUrl(store.users.get(u) ?? { id: u })} size={32} />
        <span class="name">{store.displayName(u, server) || m.markdown.unknownUser}</span>
        {#if u === store.selfId || manage}<Button size="sm" variant="ghost" onclick={() => remove(u)}>{m.reactions.remove}</Button>{/if}
      </li>
    {/each}
  </ul>
  {#snippet actions()}
    {#if manage && emoji}<Button variant="danger" onclick={removeAll}>{m.reactions.removeAll(label(emoji))}</Button>{/if}
    <Button onclick={() => reactionsView.close()}>{m.reactions.close}</Button>
  {/snippet}
</Dialog>

<style>
  .tabs { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-4); }
  .tab {
    display: inline-flex; align-items: center; gap: var(--space-2); min-height: 2rem; padding: 0 var(--space-3); border: 1px solid transparent;
    border-radius: var(--radius-md); background: var(--surface-3); color: var(--text-secondary); font: 500 var(--text-sm) var(--font-sans); cursor: pointer;
  }
  .tab[aria-selected='true'] { background: var(--accent-subtle); border-color: var(--accent); color: var(--text-strong); }
  .tab img { width: 1.25rem; height: 1.25rem; object-fit: contain; }
  ul { display: grid; gap: var(--space-1); max-height: 50vh; margin: 0; padding: 0; overflow-y: auto; list-style: none; }
  li { display: flex; align-items: center; gap: var(--space-3); min-height: 2.75rem; }
  .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-strong); }
</style>
