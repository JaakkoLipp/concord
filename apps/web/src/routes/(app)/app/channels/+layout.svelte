<script lang="ts">
  import type { Snippet } from 'svelte';
  import { page } from '$app/state';
  import { app } from '$lib/session/app.svelte.ts';
  import Shell from '$lib/shell/Shell.svelte';
  import MemberList from '$lib/shell/MemberList.svelte';
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
  <Shell store={session.store} {server} {channel} panel={server ? members : undefined}>
    {@render children()}
  </Shell>
{/if}

{#snippet members()}
  {#if session && server}<MemberList store={session.store} {server} />{/if}
{/snippet}
