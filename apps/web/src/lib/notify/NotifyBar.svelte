<script lang="ts">
  /** Asks once per browser whether to show desktop notifications (m2c-plan.md decision 6). */
  import { Button } from '@concord/ui';
  import BellRing from '@lucide/svelte/icons/bell-ring';
  import { m } from '$lib/i18n/index.ts';
  import { notifyPrefs } from './prefs.svelte.ts';
</script>

{#if notifyPrefs.ask}
  <div class="bar" role="region" aria-label={m.notify.switch}>
    <BellRing size={18} aria-hidden="true" />
    <span>{m.notify.bar}</span>
    <Button size="sm" onclick={() => notifyPrefs.enable()}>{m.notify.enable}</Button>
    <Button size="sm" variant="ghost" onclick={() => notifyPrefs.disable()}>{m.notify.notNow}</Button>
  </div>
{/if}

<style>
  .bar {
    position: fixed; top: var(--space-3); left: 50%; translate: -50% 0; z-index: 700;
    display: flex; align-items: center; gap: var(--space-3); max-width: calc(100vw - 2 * var(--space-4));
    padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4); border-radius: var(--radius-lg);
    background: var(--surface-4); border: 1px solid var(--border-default); box-shadow: var(--shadow-popover);
    color: var(--text-strong); font: 500 var(--text-sm) var(--font-sans);
  }
  span { flex: 1; }
</style>
