<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { app } from '$lib/session/app.svelte.ts';
  import ChatHeader from '$lib/shell/ChatHeader.svelte';
  import Composer from '$lib/shell/Composer.svelte';
  import { m } from '$lib/i18n/index.ts';
  import { channelName, rememberChannel } from '$lib/view/channels.ts';
  import MessageList from './MessageList.svelte';

  let { channel, message }: { channel: string; message?: string | undefined } = $props();
  const session = $derived(app.session!);
  const store = $derived(session.store);
  const info = $derived(store.channels.get(channel));
  let target = $state<string | undefined>(undefined);

  $effect(() => {
    target = message;
    if (message) void session.jumpTo(channel, message);
    else void session.openChannel(channel);
  });
  $effect(() => {
    if (info) rememberChannel(info.kind === 'text' ? info.server : '@me', channel);
  });

  /** Jump to a message in this channel: through the URL for server channels, in place for DMs. */
  function jump(id: string) {
    if (info?.kind === 'text') {
      void goto(resolve('/(app)/app/channels/[server]/[channel]/[[message]]', { server: info.server, channel, message: id }));
    } else {
      target = id;
      if (!store.messages.has(id) || !store.windows.get(channel)?.ids.includes(id)) void session.jumpTo(channel, id);
    }
  }

  const placeholder = $derived(info ? (info.kind === 'dm' ? m.shell.messageUser(channelName(store, info)) : m.shell.messageChannel(channelName(store, info))) : '');
</script>

<ChatHeader {store} channel={info} />
<div class="body">
  <MessageList {session} {channel} {target} onjump={jump} />
</div>
<Composer {placeholder} {session} channel={info} />

<style>
  .body { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; }
</style>
