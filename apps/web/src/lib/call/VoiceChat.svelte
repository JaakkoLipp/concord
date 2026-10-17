<script lang="ts">
  /**
   * A voice channel's text chat, in the side panel beside the call view (client.md section 10.3). The
   * conversation column still owns the channel: it opens it and keeps it remembered.
   */
  import { IconButton } from '@concord/ui';
  import type { Session } from '@concord/domain';
  import X from '@lucide/svelte/icons/x';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import MessageList from '$lib/conversation/MessageList.svelte';
  import Composer from '$lib/shell/Composer.svelte';
  import { m } from '$lib/i18n/index.ts';
  import { channelName } from '$lib/view/channels.ts';
  import { shell } from '$lib/view/shell.svelte.ts';

  let { session, channel }: { session: Session; channel: string } = $props();
  const info = $derived(session.store.channels.get(channel));
  const name = $derived(info ? channelName(session.store, info) : '');
  /** A message linked to in this channel, which the chat scrolls to. */
  const target = $derived(page.params.channel === channel ? page.params.message : undefined);

  function jump(id: string) {
    if (info?.kind === 'text') void goto(resolve('/(app)/app/channels/[server]/[channel]/[[message]]', { server: info.server, channel, message: id }));
  }
</script>

<section class="chat" aria-labelledby="voice-chat-title">
  <header>
    <!-- A chat icon and the channel's name; the X closes it until the next voice channel (motion spec 4.9). -->
    <h2 id="voice-chat-title" aria-label={m.call.chat(name)}><MessageSquare size={20} aria-hidden="true" /><span>{name}</span></h2>
    <IconButton size="sm" placement="bottom" label={m.call.closeChat} onclick={() => (shell.voiceChat = false)}><X size={18} /></IconButton>
  </header>
  <div class="body"><MessageList {session} {channel} {target} onjump={jump} /></div>
  <Composer placeholder={m.shell.messageChannel(name)} {session} channel={info} />
</section>

<style>
  .chat { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  header { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); min-height: var(--header-h); padding: 0 var(--space-4); border-bottom: 1px solid var(--border-subtle); }
  h2 { display: flex; align-items: center; gap: var(--space-3); min-width: 0; margin: 0; color: var(--text-strong); font: 700 var(--text-md) var(--font-sans); }
  h2 :global(svg) { flex: none; color: var(--text-secondary); }
  h2 span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .body { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; }
</style>
