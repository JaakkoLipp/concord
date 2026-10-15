<script lang="ts">
  /**
   * Asks how to share before the browser's picker opens (client.md section 10.6): the quality preset, from the
   * settings' default, and "Share audio" in Chromium. Firefox shares VP8 in one layer, so it says so. The Share
   * click starts the capture itself, which keeps the user's gesture for the picker.
   */
  import { Button, Dialog } from '@concord/ui';
  import { m } from '$lib/i18n/index.ts';
  import type { VoiceController } from '$lib/voice/controller.svelte.ts';
  import { loadVoiceSettings, type SharePreset } from '$lib/voice/settings.ts';
  import { canShareAudio, shareBrowser } from '$lib/voice/share.ts';
  import { shareDialog } from './share.svelte.ts';

  let { voice }: { voice: VoiceController } = $props();
  const PRESETS: SharePreset[] = ['1080p60', '1080p30', '720p30', 'text'];
  const browser = typeof navigator === 'undefined' ? 'other' : shareBrowser(navigator.userAgent);
  let preset = $state<SharePreset>('1080p60');
  let audio = $state(false);

  // Each opening starts from the settings' default quality.
  $effect(() => {
    if (shareDialog.open) preset = loadVoiceSettings().sharePreset;
  });

  function share() {
    shareDialog.open = false;
    voice.startShare(preset, audio && canShareAudio(browser));
  }
</script>

<Dialog open={shareDialog.open} title={m.call.shareTitle} onclose={() => (shareDialog.open = false)}>
  <fieldset class="group">
    <legend class="label">{m.call.shareQuality}</legend>
    {#each PRESETS as p (p)}
      <label class="option"><input type="radio" name="share-preset" value={p} bind:group={preset} />{m.settings.voice.presets[p]}</label>
    {/each}
  </fieldset>
  {#if canShareAudio(browser)}
    <label class="option check"><input type="checkbox" bind:checked={audio} /><span>{m.call.shareAudio}<small>{m.call.shareAudioHelp}</small></span></label>
  {:else if browser === 'firefox'}
    <p class="note">{m.call.shareFirefox}</p>
  {/if}
  {#snippet actions()}
    <Button variant="ghost" onclick={() => (shareDialog.open = false)}>{m.call.cancel}</Button>
    <Button onclick={share}>{m.call.shareGo}</Button>
  {/snippet}
</Dialog>

<style>
  .group { display: grid; gap: var(--space-2); margin: 0 0 var(--space-4); padding: 0; border: 0; }
  .label { padding: 0; color: var(--text-secondary); font: 700 var(--text-xs) var(--font-sans); letter-spacing: 0.02em; text-transform: uppercase; }
  .option { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) 0; color: var(--text-strong); font: 500 var(--text-md) var(--font-sans); cursor: pointer; }
  .check { align-items: flex-start; }
  .check input { margin-top: 0.2rem; }
  .check span { display: grid; gap: var(--space-1); }
  small { color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  .note { margin: 0; color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
</style>
