<script lang="ts">
  /** User settings, Notifications: the per-browser switch, and why it can't turn on if the browser blocks it. */
  import { m } from '$lib/i18n/index.ts';
  import { notifyPrefs } from './prefs.svelte.ts';

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
</style>
