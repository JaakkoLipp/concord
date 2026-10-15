<script lang="ts">
  import { IconButton } from '@concord/ui';
  import type { Channel, Store } from '@concord/domain';
  import AtSign from '@lucide/svelte/icons/at-sign';
  import Hash from '@lucide/svelte/icons/hash';
  import Menu from '@lucide/svelte/icons/menu';
  import Phone from '@lucide/svelte/icons/phone';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import Pin from '@lucide/svelte/icons/pin';
  import UserRound from '@lucide/svelte/icons/user-round';
  import Users from '@lucide/svelte/icons/users';
  import Volume2 from '@lucide/svelte/icons/volume-2';
  import { m } from '$lib/i18n/index.ts';
  import { channelName } from '$lib/view/channels.ts';
  import { shell } from '$lib/view/shell.svelte.ts';
  import { app } from '$lib/session/app.svelte.ts';
  import { participantMenu } from '$lib/call/menu.ts';
  import { menuOn } from '$lib/view/contextmenu.svelte.ts';
  import { dmPartner } from '$lib/view/channels.ts';

  let { store, channel }: { store: Store; channel: Channel | undefined } = $props();
  let searchText = $state('');
  // Each channel starts with an empty search box. Keyed on the ID, so updates to the channel don't clear it.
  const channelId = $derived(channel?.id);
  $effect(() => {
    void channelId;
    searchText = '';
  });
  const partner = $derived(channel?.kind === 'dm' ? dmPartner(store, channel) : undefined);
  const panelLabel = $derived(channel?.kind === 'dm' ? (shell.panelOpen ? m.shell.hideProfile : m.shell.showProfile) : (shell.panelOpen ? m.shell.hideMembers : m.shell.showMembers));
</script>

<header class="header">
  <span class="narrow-only"><IconButton label={m.shell.openSidebar} onclick={() => (shell.sidebarOpen = true)}><Menu /></IconButton></span>
  {#if channel}
    <span class="icon" aria-hidden="true">
      {#if channel.kind === 'dm'}<AtSign size={22} />{:else if channel.kind === 'group'}<Users size={22} />{:else if channel.kind === 'text' && channel.voice}<Volume2 size={22} />{:else}<Hash size={22} />{/if}
    </span>
    {#if channel.kind === 'dm' && partner && app.session}
      {@const session = app.session}
      <!-- The DM's person: their menu, with their volume, on the name as on Discord (m4.5-plan.md task 5). -->
      <h1><span class="person" use:menuOn={() => participantMenu(session, app.voice, partner, { inDm: true })}>{channelName(store, channel)}</span></h1>
    {:else}
      <h1>{channelName(store, channel)}</h1>
    {/if}
    {#if (channel.kind === 'text' || channel.kind === 'group') && channel.description}
      <span class="divider" aria-hidden="true"></span>
      <p class="topic">{channel.description}</p>
    {/if}
    <span class="spacer"></span>
    {#if (channel.kind === 'dm' || channel.kind === 'group') && app.voice}
      <!-- Joining the DM's call starts it, and Stoat rings everyone else (client.md section 10.8). -->
      {@const voice = app.voice}
      {@const inCall = voice.channel === channel.id && voice.status !== 'none' && voice.status !== 'disconnected'}
      <IconButton label={inCall ? m.voice.inCall : store.voice.has(channel.id) ? m.voice.joinCall : m.voice.startCall} disabled={inCall} onclick={() => voice.join(channel.id)}><Phone /></IconButton>
    {/if}
    {@const pinsOpen = shell.find?.channel === channel.id && shell.find.mode === 'pins'}
    <IconButton label={m.find.pins} active={pinsOpen} aria-pressed={pinsOpen} onclick={() => (pinsOpen ? (shell.find = null) : shell.openFind(channel.id, 'pins'))}><Pin /></IconButton>
    {#if channel.kind === 'text' && channel.voice}
      <!-- A voice channel's chat takes the member list's place (client.md section 10.3). -->
      <IconButton label={shell.voiceChat ? m.call.hideChat : m.call.showChat} active={shell.voiceChat} aria-pressed={shell.voiceChat} onclick={() => (shell.voiceChat = !shell.voiceChat)}><MessageSquare /></IconButton>
    {:else}
      <IconButton label={panelLabel} active={shell.panelOpen} aria-pressed={shell.panelOpen} onclick={() => (shell.panelOpen = !shell.panelOpen)}>
        {#if channel.kind === 'dm'}<UserRound />{:else}<Users />{/if}
      </IconButton>
    {/if}
    <input class="search" type="search" placeholder={m.shell.search} aria-label={m.shell.search} bind:value={searchText}
      onkeydown={(e) => {
        const q = searchText.trim();
        if (e.key === 'Enter' && q) shell.openFind(channel.id, 'search', q.slice(0, 64));
        if (e.key === 'Escape') { searchText = ''; if (shell.find?.mode === 'search') shell.find = null; }
      }} />
  {/if}
</header>

<style>
  .header {
    display: flex; align-items: center; gap: var(--space-3); min-height: var(--header-h); padding: 0 var(--space-4) 0 var(--space-5);
    border-bottom: 1px solid var(--border-subtle); min-width: 0;
  }
  .icon { display: grid; color: var(--text-muted); flex: none; }
  h1 { margin: 0; color: var(--text-strong); font: 500 var(--text-md) var(--font-sans); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 0 1 auto; }
  .divider { width: 1px; height: 1.5rem; background: var(--border-default); flex: none; }
  .topic { margin: 0; min-width: 0; flex: 1 1 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  .spacer { flex: 1; }
  .topic + .spacer { flex: 0; }
  .search {
    width: 15rem; min-height: 1.75rem; padding: 0 var(--space-3); margin-left: var(--space-2);
    border: 1px solid var(--border-subtle); border-radius: var(--radius-md); background: var(--surface-1); color: var(--text-normal);
    font: var(--text-sm) var(--font-sans);
  }
  .search::placeholder { color: var(--text-secondary); }
  .narrow-only { display: none; }
  @media (max-width: 700px) {
    .narrow-only { display: contents; }
    .search, .divider, .topic { display: none; }
  }
  @media (max-width: 1100px) { .search { width: 9rem; } }
</style>
