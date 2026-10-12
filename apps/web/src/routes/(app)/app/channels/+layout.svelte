<script lang="ts">
  import type { Snippet } from 'svelte';
  import { page } from '$app/state';
  import { app } from '$lib/session/app.svelte.ts';
  import Shell from '$lib/shell/Shell.svelte';
  import MemberList from '$lib/shell/MemberList.svelte';
  import DmProfilePanel from '$lib/people/DmProfilePanel.svelte';
  import UserPopout from '$lib/people/UserPopout.svelte';
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
  <Shell store={session.store} {server} {channel} panel={server ? members : info?.kind === 'dm' ? profile : undefined} panelWidth={server ? 'members' : 'profile'}>
    {@render children()}
  </Shell>
  <UserPopout {session} />
{/if}

{#snippet profile()}
  {#if session && channel}<DmProfilePanel {session} {channel} />{/if}
{/snippet}

{#snippet members()}
  {#if session && server}<MemberList store={session.store} {server} />{/if}
{/snippet}
