<script module lang="ts">
  // Header components remount on navigation; retain only whether this store has ever connected.
  const readyStores = new WeakSet<object>();
</script>

<script lang="ts">
  import type { Store } from '@concord/domain';
  import WifiOff from '@lucide/svelte/icons/wifi-off';
  import { m } from '$lib/i18n/index.ts';

  let { store }: { store: Store } = $props();
  let hadReady = $state(false);
  let browserOffline = $state(typeof navigator !== 'undefined' && !navigator.onLine);
  $effect(() => {
    if (store.connection === 'ready') readyStores.add(store);
    hadReady = readyStores.has(store);
  });
  const visible = $derived(hadReady && (browserOffline || store.connection === 'reconnecting' || store.connection === 'offline'));
</script>

<svelte:window onoffline={() => (browserOffline = true)} ononline={() => (browserOffline = false)} />
{#if visible}
  <div class="connection-banner" role="status">
    <WifiOff size={16} />
    <span>{browserOffline ? m.connection.offline : m.connection.reconnecting}</span>
  </div>
{/if}

<style>
  .connection-banner {
    display: flex; flex: none; align-items: center; justify-content: center; gap: var(--space-3);
    min-height: var(--row-channel); padding: var(--space-2) var(--space-4);
    border-bottom: 1px solid var(--border-default); background: var(--surface-2);
    color: var(--text-secondary); font: 500 var(--text-sm) var(--font-sans);
  }
</style>
