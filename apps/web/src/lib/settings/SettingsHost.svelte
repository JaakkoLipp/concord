<script lang="ts">
  /** Draws the settings modal from the shallow page state, over the shell in the channels layout (modal.svelte.ts). */
  import { page } from '$app/state';
  import { onDestroy, untrack } from 'svelte';
  import type { Session } from '@concord/domain';
  import ServerSettings from '$lib/admin/ServerSettings.svelte';
  import ChannelSettings from '$lib/admin/ChannelSettings.svelte';
  import Settings from './Settings.svelte';
  import { settingsModal, userSection } from './modal.svelte.ts';

  let { session }: { session: Session } = $props();
  settingsModal.hosted = true;
  onDestroy(() => settingsModal.detach());
  $effect(() => {
    const wanted = page.state.settings;
    untrack(() => settingsModal.follow(wanted));
  });
  const t = $derived(settingsModal.shown);
</script>

{#if t?.kind === 'user'}
  <Settings {session} section={userSection(t.section)} />
{:else if t?.kind === 'server'}
  <ServerSettings {session} server={t.server} section={t.section} />
{:else if t?.kind === 'channel'}
  <ChannelSettings {session} channel={t.channel} section={t.section} />
{/if}
