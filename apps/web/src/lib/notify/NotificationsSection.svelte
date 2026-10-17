<script lang="ts">
  /**
   * User settings, Notifications: the per-browser switch, and why it can't turn on if the browser blocks it; and
   * message sounds with their volume (M4.8 task 11), which don't need the browser's permission.
   */
  import { m } from '$lib/i18n/index.ts';
  import { playMessageSound } from '$lib/voice/sounds.ts';
  import { notifyPrefs, soundPrefs } from './prefs.svelte.ts';

  const unsupported = $derived(notifyPrefs.permission === 'unsupported');
  const blocked = $derived(notifyPrefs.permission === 'denied');
  function toggle(e: Event) {
    if ((e.currentTarget as HTMLInputElement).checked) void notifyPrefs.enable();
    else notifyPrefs.disable();
  }
</script>

<div class="row">
  <div class="text">
    <span class="name" id="notify-switch">{m.notify.switch}</span>
    <span class="help">{m.notify.switchHelp}</span>
  </div>
  <label class="switch">
    <input type="checkbox" role="switch" aria-labelledby="notify-switch" checked={notifyPrefs.active} disabled={unsupported || blocked} onchange={toggle} />
    <span class="track" aria-hidden="true"></span>
  </label>
</div>
{#if blocked}<p class="note" role="status">{m.notify.blocked}</p>{/if}
{#if unsupported}<p class="note" role="status">{m.notify.unsupported}</p>{/if}

<div class="row sounds">
  <div class="text">
    <span class="name" id="sound-switch">{m.notify.sounds}</span>
    <span class="help">{m.notify.soundsHelp}</span>
  </div>
  <label class="switch">
    <input type="checkbox" role="switch" aria-labelledby="sound-switch" checked={soundPrefs.on} onchange={(e) => soundPrefs.set({ on: e.currentTarget.checked })} />
    <span class="track" aria-hidden="true"></span>
  </label>
</div>
<label class="volume">
  <span class="label">{m.notify.soundsVolume}<span class="value">{m.notify.percent(soundPrefs.volume)}</span></span>
  <!-- Letting go plays the sound at the new volume, so it can be heard before a message comes. -->
  <input class="slider" type="range" min="0" max="100" step="5" value={soundPrefs.volume} disabled={!soundPrefs.on} style:--fill="{soundPrefs.volume}%"
    oninput={(e) => soundPrefs.set({ volume: Number(e.currentTarget.value) })} onchange={() => playMessageSound('message', soundPrefs.volume)} />
</label>
<p class="note">{m.notify.ignoreBroadSettings}</p>

<style>
  .row { display: flex; align-items: center; gap: var(--space-5); }
  .text { flex: 1; display: grid; gap: 2px; }
  .name { color: var(--text-strong); font: 500 var(--text-md) var(--font-sans); }
  .help, .note { color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  .note { margin: var(--space-4) 0 0; }
  .switch { position: relative; flex: none; display: inline-flex; cursor: pointer; }
  .switch input { position: absolute; inset: 0; z-index: 1; opacity: 0; margin: 0; cursor: inherit; }
  .track { width: 2.5rem; height: 1.5rem; border-radius: var(--radius-full); background: var(--surface-5); position: relative; }
  .track::after { content: ''; position: absolute; top: 3px; left: 3px; width: 1.125rem; height: 1.125rem; border-radius: var(--radius-full); background: var(--text-strong); transition: translate calc(var(--dur-state) * var(--motion)) var(--ease-out); }
  .switch input:checked + .track { background: var(--status-online); }
  .switch input:checked + .track::after { translate: 1rem 0; }
  .switch input:focus-visible + .track { outline: 2px solid var(--accent); outline-offset: 2px; }
  .switch input:disabled + .track { opacity: 0.5; }
  .sounds { margin-top: var(--space-8); }
  .volume { display: grid; gap: var(--space-3); margin-top: var(--space-5); }
  .label { display: flex; justify-content: space-between; gap: var(--space-3); color: var(--text-secondary); font: 700 var(--text-xs) var(--font-sans); letter-spacing: 0.02em; text-transform: uppercase; }
  .value { color: var(--text-normal); font-variant-numeric: tabular-nums; text-transform: none; }
  /* As the voice settings' sliders: the native range input, drawn with tokens. */
  .slider { appearance: none; width: 100%; height: var(--icon-md); margin: 0; background: transparent; cursor: pointer; }
  .slider:disabled { opacity: 0.5; cursor: default; }
  .slider::-webkit-slider-runnable-track { height: var(--space-2); border-radius: var(--radius-full); background: linear-gradient(to right, var(--accent) var(--fill, 0%), var(--surface-5) var(--fill, 0%)); }
  .slider::-moz-range-track { height: var(--space-2); border-radius: var(--radius-full); background: linear-gradient(to right, var(--accent) var(--fill, 0%), var(--surface-5) var(--fill, 0%)); }
  .slider::-webkit-slider-thumb { appearance: none; width: var(--icon-sm); height: var(--icon-sm); margin-top: calc((var(--space-2) - var(--icon-sm)) / 2); border: 0; border-radius: var(--radius-full); background: var(--text-strong); }
  .slider::-moz-range-thumb { width: var(--icon-sm); height: var(--icon-sm); border: 0; border-radius: var(--radius-full); background: var(--text-strong); }
  .slider:focus-visible { outline: none; }
  .slider:focus-visible::-webkit-slider-thumb { outline: 2px solid var(--accent); outline-offset: 2px; }
  .slider:focus-visible::-moz-range-thumb { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
