<script lang="ts">
  /**
   * Ctrl+/ lists every keyboard shortcut: the registry's entries, then the two voice keybinds (M4.8 task 1).
   * Opened from the keyboard, it doesn't animate.
   */
  import { Button, Dialog } from '@concord/ui';
  import { m } from '$lib/i18n/index.ts';
  import { keybindLabel } from '$lib/voice/keybinds.ts';
  import { loadVoiceSettings, onVoiceSettings, type VoiceSettings } from '$lib/voice/settings.ts';
  import { shortcutsDialog } from '$lib/view/shortcutsDialog.svelte.ts';
  import { list } from './shortcuts.ts';

  const shortcuts = list();
  let voice = $state<VoiceSettings>(loadVoiceSettings());
  $effect(() => onVoiceSettings((s) => (voice = s)));
</script>

<Dialog open={shortcutsDialog.open} title={m.shortcuts.title} onclose={() => shortcutsDialog.close()} still={shortcutsDialog.still} width="32rem">
  <h3>{m.shortcuts.heading}</h3>
  <ul class="rows">
    {#each shortcuts as entry (entry.id)}
      <li><span>{entry.label}</span><kbd>{keybindLabel(entry.keys)}</kbd></li>
    {/each}
  </ul>
  <h3>{m.settings.voice.keybinds}</h3>
  <ul class="rows">
    {#each [[m.settings.voice.mute, voice.muteKey], [m.settings.voice.deafen, voice.deafenKey]] as const as [label, bind] (label)}
      <li><span>{label}</span><kbd class:empty={!bind}>{bind ? keybindLabel(bind) : m.settings.voice.noShortcut}</kbd></li>
    {/each}
  </ul>
  {#snippet actions()}
    <Button variant="primary" onclick={() => shortcutsDialog.close()}>{m.shortcuts.close}</Button>
  {/snippet}
</Dialog>

<style>
  h3 { margin: var(--space-5) 0 var(--space-3); color: var(--text-secondary); font: 700 var(--text-sm) var(--font-sans); }
  h3:first-child { margin-top: 0; }
  .rows { display: grid; gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
  .rows li { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); min-height: var(--control-h); }
  kbd { padding: var(--space-2) var(--space-4); border: 1px solid var(--border-control); border-radius: var(--radius-md); background: var(--surface-3); color: var(--text-strong); font: 500 var(--text-sm) var(--font-sans); white-space: nowrap; }
  kbd.empty { color: var(--text-secondary); }
</style>
