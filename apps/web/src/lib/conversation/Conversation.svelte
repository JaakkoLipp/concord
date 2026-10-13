<script lang="ts">
  import { untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { app } from '$lib/session/app.svelte.ts';
  import ChatHeader from '$lib/shell/ChatHeader.svelte';
  import Composer from '$lib/shell/Composer.svelte';
  import { m } from '$lib/i18n/index.ts';
  import { channelName, rememberChannel } from '$lib/view/channels.ts';
  import MessageList from './MessageList.svelte';
  import Upload from '@lucide/svelte/icons/upload';
  import { attachFiles } from '$lib/composer/files.ts';

  let { channel, message }: { channel: string; message?: string | undefined } = $props();
  const session = $derived(app.session!);
  const store = $derived(session.store);
  const info = $derived(store.channels.get(channel));
  let target = $state<string | undefined>(undefined);

  $effect(() => {
    target = message;
    // A channel that is gone, or never was, shows an empty conversation rather than an error. untrack:
    // these read the store, and dropping the window of a group just left must not load it again.
    const [c, msg] = [channel, message];
    untrack(() => {
      if (msg) void session.jumpTo(c, msg).catch(() => {});
      else void session.openChannel(c).catch(() => {});
    });
  });
  // Left, removed or deleted while open: go to the friends screen.
  let seen = $state<string | null>(null);
  $effect(() => {
    if (info) seen = channel;
    else if (seen === channel && store.connection === 'ready') void goto(resolve('/app/channels/@me'));
  });
  $effect(() => {
    if (info) rememberChannel(info.kind === 'text' ? info.server : '@me', channel);
  });

  /** Jump to a message in this channel, through the URL. */
  function jump(id: string) {
    void goto(info?.kind === 'text'
      ? resolve('/(app)/app/channels/[server]/[channel]/[[message]]', { server: info.server, channel, message: id })
      : resolve('/(app)/app/channels/@me/[channel]/[[message]]', { channel, message: id }));
  }

  let dragDepth = $state(0);
  const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');

  const placeholder = $derived(info ? (info.kind === 'dm' ? m.shell.messageUser(channelName(store, info)) : m.shell.messageChannel(channelName(store, info))) : '');
</script>

<!-- Files dragged over the conversation attach to the next message (m2a-plan.md task 6). -->
<div class="conversation" role="region" aria-label={m.conversation.messages}
  ondragenter={(e) => { if (hasFiles(e)) { e.preventDefault(); dragDepth++; } }}
  ondragover={(e) => { if (hasFiles(e)) e.preventDefault(); }}
  ondragleave={() => (dragDepth = Math.max(0, dragDepth - 1))}
  ondrop={(e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth = 0; if (info) attachFiles(store, info, [...(e.dataTransfer?.files ?? [])]); }}>
  <ChatHeader {store} channel={info} />
  <div class="body">
    <MessageList {session} {channel} {target} onjump={jump} />
  </div>
  <Composer {placeholder} {session} channel={info} />
  {#if dragDepth > 0 && info}
    <div class="drop" aria-hidden="true">
      <div class="drop-card">
        <Upload size={40} />
        <strong>{m.files.dropTitle(info.kind === 'dm' ? `@${channelName(store, info)}` : `#${channelName(store, info)}`)}</strong>
        <span>{m.files.dropHint}</span>
      </div>
    </div>
  {/if}
</div>

<style>
  .conversation { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .body { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .drop { position: absolute; inset: 0; z-index: 20; display: grid; place-items: center; background: var(--scrim); pointer-events: none; }
  .drop-card {
    display: flex; flex-direction: column; align-items: center; gap: var(--space-3); padding: var(--space-8) var(--space-10);
    border: 2px dashed var(--accent); border-radius: var(--radius-xl); background: var(--surface-1); color: var(--text-strong); font: var(--text-md) var(--font-sans);
  }
  .drop-card span { color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
</style>
