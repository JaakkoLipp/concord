<script lang="ts">
  /**
   * The voice panel above the user dock, in one panel with it as on Discord (client.md section 10.3): the call's
   * state, its connection quality, where it is, and its controls. After a call ends without the user, it says why and offers Rejoin.
   */
  import { Button, IconButton, leave, tooltip } from '@concord/ui';
  import type { Store } from '@concord/domain';
  import AudioLines from '@lucide/svelte/icons/audio-lines';
  import AudioLinesOff from '@lucide/svelte/icons/audio-lines-off';
  import PhoneOff from '@lucide/svelte/icons/phone-off';
  import ScreenShare from '@lucide/svelte/icons/screen-share';
  import SignalHigh from '@lucide/svelte/icons/signal-high';
  import SignalLow from '@lucide/svelte/icons/signal-low';
  import SignalMedium from '@lucide/svelte/icons/signal-medium';
  import SignalZero from '@lucide/svelte/icons/signal-zero';
  import Video from '@lucide/svelte/icons/video';
  import VideoOff from '@lucide/svelte/icons/video-off';
  import X from '@lucide/svelte/icons/x';
  import { resolve } from '$app/paths';
  import { m } from '$lib/i18n/index.ts';
  import { channelName } from '$lib/view/channels.ts';
  import type { VoiceController } from '$lib/voice/controller.svelte.ts';
  import ShareDialog from '$lib/call/ShareDialog.svelte';
  import { shareDialog } from '$lib/call/share.svelte.ts';
  import { onMount } from 'svelte';
  import { loadVoiceSettings, onVoiceSettings, saveVoiceSettings } from '$lib/voice/settings.ts';

  /** `calling`: alone in a DM or group call this account started (client.md section 10.8). */
  let { store, voice, calling = false }: { store: Store; voice: VoiceController; calling?: boolean } = $props();

  const channel = $derived(voice.channel ? store.channels.get(voice.channel) : undefined);
  const place = $derived(channel?.kind === 'text' ? (store.servers.get(channel.server)?.name ?? '') : m.voice.directCall);
  const href = $derived(
    !channel ? undefined
    : channel.kind === 'text' ? resolve('/(app)/app/channels/[server]/[channel]/[[message]]', { server: channel.server, channel: channel.id })
    : resolve('/(app)/app/channels/@me/[channel]/[[message]]', { channel: channel.id }),
  );
  const title = $derived(
    voice.status === 'connected' ? (calling ? m.voice.calling : m.voice.connected)
    : voice.status === 'connecting' ? m.voice.connecting
    : voice.status === 'reconnecting' ? m.voice.reconnecting
    : voice.ended === 'elsewhere' ? m.voice.elsewhere : m.voice.disconnected,
  );
  // Noise suppression, on or off from here as on Discord (m4.5-plan.md task 4). Off is the browser's own.
  let suppressing = $state(loadVoiceSettings().noiseSuppression === 'rnnoise');
  onMount(() => onVoiceSettings((s) => (suppressing = s.noiseSuppression === 'rnnoise')));
  function share() {
    if (voice.videoLock) return;
    if (voice.sharing) voice.stopShare();
    else shareDialog.open = true;
  }
  const tip = $derived([m.voice.quality[voice.quality], m.voice.stats(voice.ping, voice.loss)].filter(Boolean).join('. '));
</script>

{#if voice.status !== 'none'}
  <section class="panel" aria-label={m.voice.panel} out:leave>
    <div class="top">
      {#if voice.status === 'connected'}
        <!-- A button only so keyboard users can reach the tooltip with ping and loss. -->
        <button type="button" class="quality {voice.quality}" aria-label={tip} use:tooltip={tip}>
          {#if voice.quality === 'excellent'}<SignalHigh />{:else if voice.quality === 'good'}<SignalMedium />{:else if voice.quality === 'poor'}<SignalLow />{:else}<SignalZero />{/if}
        </button>
      {/if}
      <div class="text">
        <p class="state {voice.status}" role="status">{title}</p>
        {#if channel && href}<a class="where" {href}>{m.voice.where(channelName(store, channel), place)}</a>{/if}
        {#if voice.status === 'connected' && !voice.rights.listen && !voice.serverDeafened}<span class="note">{m.voice.cantHear}</span>{/if}
      </div>
      {#if voice.status === 'disconnected'}
        <Button size="sm" onclick={() => voice.rejoin()}>{m.voice.rejoin}</Button>
        <IconButton label={m.voice.dismiss} onclick={() => voice.leave()}><X /></IconButton>
      {:else}
        <IconButton label={m.voice.disconnect} onclick={() => voice.leave()}><PhoneOff /></IconButton>
      {/if}
    </div>
    {#if voice.status !== 'disconnected'}
      <div class="actions">
        <!-- Without Video they stay focusable, so the tooltip says why (m4.7-plan.md task 5). -->
        <IconButton label={voice.videoLock ?? (voice.camera ? m.voice.cameraOff : m.voice.cameraOn)} active={voice.camera}
          aria-disabled={!!voice.videoLock} disabled={voice.status !== 'connected'} onclick={() => voice.toggleCamera()}>
          {#if voice.camera}<Video />{:else}<VideoOff />{/if}
        </IconButton>
        <IconButton label={voice.videoLock ?? (voice.sharing ? m.voice.stopShare : m.voice.share)} active={voice.sharing}
          aria-disabled={!!voice.videoLock} disabled={voice.status !== 'connected'} onclick={share}><ScreenShare /></IconButton>
        <IconButton label={suppressing ? m.voice.noiseSuppressionOn : m.voice.noiseSuppressionOff} active={suppressing}
          onclick={() => saveVoiceSettings({ noiseSuppression: suppressing ? 'off' : 'rnnoise' })}>
          {#if suppressing}<AudioLines />{:else}<AudioLinesOff />{/if}
        </IconButton>
      </div>
    {/if}
  </section>
{/if}
<ShareDialog {voice} />

<style>
  /* It fades in with a slight rise when joining and fades out when leaving. The dock panel's height changes at once. */
  .panel {
    display: grid; gap: var(--space-3); padding: var(--space-3); border-bottom: 1px solid var(--border-default);
    transform-origin: bottom center; animation: rise var(--dur-modal) var(--ease-out);
  }
  @keyframes rise { from { opacity: 0; translate: 0 calc(var(--space-2) * var(--motion)); } }
  .top { display: flex; align-items: center; gap: var(--space-3); }
  .quality {
    display: grid; place-items: center; flex: none; width: 2.25rem; height: 2.25rem; padding: 0;
    border: 1px solid var(--border-default); border-radius: var(--radius-md); background: var(--surface-3); color: var(--text-muted); cursor: default;
  }
  .quality :global(svg) { width: var(--icon-md); height: var(--icon-md); }
  .quality:focus-visible { outline: 2px solid var(--accent); }
  .quality.excellent, .quality.good { color: var(--status-online); }
  .quality.poor { color: var(--status-idle); }
  .quality.lost { color: var(--danger); }
  .text { display: grid; flex: 1; min-width: 0; }
  .note { color: var(--text-secondary); font: var(--text-xs) var(--font-sans); }
  .actions :global(.icon-button[aria-disabled='true']) { opacity: 0.4; cursor: not-allowed; }
  .state { margin: 0; font: 600 var(--text-sm) var(--font-sans); color: var(--text-strong); }
  .state.connected { color: var(--status-online); }
  .state.connecting, .state.reconnecting { color: var(--status-idle); }
  .state.disconnected { color: var(--danger); }
  .where {
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    color: var(--text-secondary); font: var(--text-xs) var(--font-sans); text-decoration: none;
  }
  @media (hover: hover) { .where:hover { color: var(--text-strong); text-decoration: underline; } }
  /* Equal boxed buttons across the panel, as Discord's. */
  .actions { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: var(--space-3); }
  .actions :global(.icon-button) { width: 100%; border: 1px solid var(--border-default); background: var(--surface-3); }
  @media (hover: hover) { .actions :global(.icon-button:hover:not(:disabled)) { background: var(--surface-5); } }
</style>
