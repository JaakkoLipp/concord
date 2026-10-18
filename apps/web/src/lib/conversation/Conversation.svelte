<script lang="ts">
  import { untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { app } from '$lib/session/app.svelte.ts';
  import ChatHeader from '$lib/shell/ChatHeader.svelte';
  import Composer from '$lib/shell/Composer.svelte';
  import { m } from '$lib/i18n/index.ts';
  import { channelName, firstChannel, rememberChannel } from '$lib/view/channels.ts';
  import MessageList from './MessageList.svelte';
  import Upload from '@lucide/svelte/icons/upload';
  import { attachFiles } from '$lib/composer/files.ts';
  import CallView from '$lib/call/CallView.svelte';
  import { shell, WIDE_STAGE } from '$lib/view/shell.svelte.ts';
  import { nsfwConfirmed } from '$lib/view/nsfw.svelte.ts';
  import { Button } from '@concord/ui';
  import ShieldAlert from '@lucide/svelte/icons/shield-alert';

  let { channel, message }: { channel: string; message?: string | undefined } = $props();
  const session = $derived(app.session!);
  const store = $derived(session.store);
  const info = $derived(store.channels.get(channel));
  let opened = $state<string | null>(null);
  let target = $state<string | undefined>(undefined);

  $effect(() => {
    if (store.connection !== 'ready') return;
    target = message;
    opened = null;
    // A channel that is gone, or never was, shows an empty conversation rather than an error. untrack:
    // these read the store, and dropping the window of a group just left must not load it again.
    const [c, msg] = [channel, message];
    let cancelled = false;
    untrack(() => {
      const load = msg ? session.jumpTo(c, msg) : session.openChannel(c);
      void load.catch(() => {}).finally(() => { if (!cancelled) opened = c; });
    });
    return () => { cancelled = true; };
  });
  // Left, removed, deleted or hidden while open: to the server's first channel if the server is still
  // there, else the friends screen.
  let seen = $state<{ id: string; server: string | null } | null>(null);
  $effect(() => {
    if (info) seen = { id: channel, server: info.kind === 'text' ? info.server : null };
    else if (seen?.id === channel && store.connection === 'ready') {
      const server = seen.server;
      const next = server && store.servers.has(server) ? untrack(() => firstChannel(store, server)) : undefined;
      void goto(server && next ? resolve('/(app)/app/channels/[server]/[channel]/[[message]]', { server, channel: next }) : resolve('/app/channels/@me'), { replaceState: true });
    }
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

  /** A voice channel shows its call here, and its chat in the side panel. */
  const voice = $derived(info?.kind === 'text' && !!info.voice);
  // A link to a message in a voice channel opens its chat, where the message is.
  $effect(() => {
    if (voice && message) shell.voiceChat = true;
  });
  // Entering a voice channel, its chat opens with the stage where there is room beside it, and once closed stays
  // closed until the next voice channel (m4.6-plan.md decision 11).
  let chatFor: string | null = null;
  $effect(() => {
    if (!voice) { chatFor = null; return; }
    if (chatFor === channel) return;
    chatFor = channel;
    untrack(() => { if (!message) shell.voiceChat = matchMedia(WIDE_STAGE).matches; });
  });
  /** A DM or group shows its call at the top while one runs, or while we're calling (client.md section 10.3). */
  const dmCall = $derived(
    (info?.kind === 'dm' || info?.kind === 'group') && !!app.voice
    && (store.voice.has(channel) || (app.voice.channel === channel && app.voice.status !== 'none' && app.voice.status !== 'disconnected')),
  );
  /** An age-restricted channel asks once on this device before showing anything (M4.8 task 14b). */
  const gated = $derived(info?.kind === 'text' && info.nsfw && !nsfwConfirmed.has(channel));
  const placeholder = $derived(info ? (info.kind === 'dm' ? m.shell.messageUser(channelName(store, info)) : m.shell.messageChannel(channelName(store, info))) : '');
</script>

<!-- Files dragged over the conversation attach to the next message (m2a-plan.md task 6). -->
<div class="conversation" role="region" aria-label={m.conversation.messages}
  ondragenter={(e) => { if (hasFiles(e)) { e.preventDefault(); dragDepth++; } }}
  ondragover={(e) => { if (hasFiles(e)) e.preventDefault(); }}
  ondragleave={() => (dragDepth = Math.max(0, dragDepth - 1))}
  ondrop={(e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth = 0; if (info) attachFiles(store, info, [...(e.dataTransfer?.files ?? [])]); }}>
  <ChatHeader {store} channel={info} />
  {#if gated && info}
    <div class="gate" role="alertdialog" aria-labelledby="nsfw-title" aria-describedby="nsfw-body">
      <ShieldAlert size={48} aria-hidden="true" />
      <h2 id="nsfw-title">{m.conversation.nsfwTitle}</h2>
      <p id="nsfw-body">{m.conversation.nsfwBody(channelName(store, info))}</p>
      <div class="gate-actions">
        <Button variant="secondary" onclick={() => void goto(resolve('/app/channels/@me'))}>{m.conversation.nsfwBack}</Button>
        <Button onclick={() => nsfwConfirmed.confirm(channel)}>{m.conversation.nsfwContinue}</Button>
      </div>
    </div>
  {:else if voice && app.voice}
    <CallView {session} voice={app.voice} {channel} />
  {:else}
    {#if dmCall && app.voice}<CallView {session} voice={app.voice} {channel} compact />{/if}
    <div class="body">
      <MessageList {session} {channel} {target} opening={opened !== channel} onjump={jump} />
    </div>
    <Composer {placeholder} {session} channel={info} />
  {/if}
  {#if dragDepth > 0 && info && !voice && !gated}
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
  .gate {
    flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--space-4);
    padding: var(--space-8) var(--space-5); text-align: center; color: var(--text-secondary);
  }
  .gate h2 { margin: 0; color: var(--text-strong); font: 700 var(--text-xl) var(--font-sans); }
  .gate p { margin: 0; max-width: 28rem; color: var(--text-normal); font: var(--text-md) var(--font-sans); }
  .gate-actions { display: flex; gap: var(--space-3); margin-top: var(--space-3); }
  .drop { position: absolute; inset: 0; z-index: 20; display: grid; place-items: center; background: var(--scrim); pointer-events: none; }
  .drop-card {
    display: flex; flex-direction: column; align-items: center; gap: var(--space-3); padding: var(--space-8) var(--space-10);
    border: 2px dashed var(--accent); border-radius: var(--radius-xl); background: var(--surface-1); color: var(--text-strong); font: var(--text-md) var(--font-sans);
  }
  .drop-card span { color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
</style>
