<script lang="ts">
  import type { Snippet } from 'svelte';
  import { page } from '$app/state';
  import { app } from '$lib/session/app.svelte.ts';
  import Shell from '$lib/shell/Shell.svelte';
  import MemberList from '$lib/shell/MemberList.svelte';
  import DmProfilePanel from '$lib/people/DmProfilePanel.svelte';
  import FindPanel from '$lib/conversation/FindPanel.svelte';
  import UserPopout from '$lib/people/UserPopout.svelte';
  import GroupPanel from '$lib/people/GroupPanel.svelte';
  import VoiceChat from '$lib/call/VoiceChat.svelte';
  import { shell } from '$lib/view/shell.svelte.ts';

  let { children }: { children: Snippet } = $props();
  const session = $derived(app.session);
  const server = $derived(page.params.server ?? null);
  const channel = $derived(page.params.channel ?? null);

  $effect(() => {
    session?.openServer(server);
  });
  $effect(() => {
    // Navigating closes the narrow-layout sidebar.
    void page.url.pathname;
    shell.sidebarOpen = false;
  });
</script>

{#if session}
  {@const info = channel ? session.store.channels.get(channel) : undefined}
  {@const finding = !!shell.find && shell.find.channel === channel}
  <!-- A voice channel shows its chat beside the call, where the member list would be (client.md section 10.3). -->
  {@const voice = !finding && info?.kind === 'text' && !!info.voice}
  <Shell store={session.store} {server} {channel} panel={finding ? find : voice ? chat : server ? members : info?.kind === 'dm' ? profile : info?.kind === 'group' ? group : undefined}
    panelWidth={finding ? 'find' : voice ? 'chat' : server || info?.kind === 'group' ? 'members' : 'profile'} panelOpen={voice ? shell.voiceChat : undefined}>
    {@render children()}
  </Shell>
  <UserPopout {session} />
{/if}

{#snippet profile()}
  {#if session && channel}<DmProfilePanel {session} {channel} />{/if}
{/snippet}

{#snippet group()}
  {#if session && channel}<GroupPanel {session} {channel} />{/if}
{/snippet}

{#snippet find()}
  {#if session && shell.find}<FindPanel {session} channel={shell.find.channel} mode={shell.find.mode} query={shell.find.query} />{/if}
{/snippet}

{#snippet chat()}
  {#if session && channel}<VoiceChat {session} {channel} />{/if}
{/snippet}

{#snippet members()}
  {#if session && server}<MemberList store={session.store} {server} />{/if}
{/snippet}
