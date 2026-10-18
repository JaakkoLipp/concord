<script lang="ts">
  /** Draws the settings modal from the shallow page state, over the shell in the channels layout (modal.svelte.ts). */
  import { page } from '$app/state';
  import { onDestroy, untrack } from 'svelte';
  import type { Session } from '@concord/domain';
  import { settingsLeave } from '@concord/ui';
  import ServerSettings from '$lib/admin/ServerSettings.svelte';
  import ChannelSettings from '$lib/admin/ChannelSettings.svelte';
  import Settings from './Settings.svelte';
  import { settingsModal, userSection, type SettingsTarget } from './modal.svelte.ts';

  let { session }: { session: Session } = $props();
  settingsModal.hosted = true;
  onDestroy(() => settingsModal.detach());
  $effect(() => {
    const wanted = page.state.settings;
    untrack(() => settingsModal.follow(wanted));
  });
  const t = $derived(settingsModal.shown);
  // The pages keep the last target while the modal fades out, should anything in them read it again.
  let last: SettingsTarget | null = null;
  const view = $derived((last = t ?? last));
  /** At phone width settings fills the screen and only fades, as before the modal (decision 2). */
  const phone = () => matchMedia('(max-width: 800px)').matches;
</script>

<!-- The backdrop dims the app, then the modal fades and grows in after it; closing mirrors both together
     (motion spec 4.11, m4.6-plan.md task 16b). Svelte holds the closing block still through its outro. -->
{#if t}
  <div class="backdrop" out:settingsLeave={{ shrink: false, instant: settingsModal.instant }}></div>
  <div class="layer" out:settingsLeave={{ shrink: !phone(), instant: settingsModal.instant }}>
    {#if view?.kind === 'user'}
      <Settings {session} section={userSection(view.section)} />
    {:else if view?.kind === 'server'}
      <ServerSettings {session} server={view.server} section={view.section} />
    {:else if view?.kind === 'channel'}
      <ChannelSettings {session} channel={view.channel} section={view.section} />
    {/if}
  </div>
{/if}

<style>
  .backdrop { position: fixed; inset: 0; z-index: 800; background: var(--scrim); animation: backdrop-in var(--dur-backdrop) var(--ease-out); }
  /* Inset from the window, as Discord's, over the dimmed app. */
  .layer {
    position: fixed; inset: var(--space-9) var(--space-10); z-index: 800; overflow: hidden;
    border: 1px solid var(--border-subtle); border-radius: var(--radius-modal); background: var(--surface-0);
    animation: modal-in var(--dur-settings-modal) var(--ease-standard) var(--dur-settings-delay) backwards;
  }
  @keyframes backdrop-in { from { opacity: 0; } }
  @keyframes modal-in { from { opacity: 0; scale: 0.97; } }
  @keyframes phone-in { from { opacity: 0; } }
  @media (max-width: 800px) {
    .layer { inset: 0; border: 0; border-radius: 0; animation-name: phone-in; }
  }
</style>
