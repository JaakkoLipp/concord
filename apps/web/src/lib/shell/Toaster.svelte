<script lang="ts">
  import X from '@lucide/svelte/icons/x';
  import { m } from '$lib/i18n/index.ts';
  import { leave, slide } from '@concord/ui';
  import { toasts } from '$lib/view/toast.svelte.ts';
</script>

<div class="toaster" role="status" aria-live="polite">
  {#each toasts.list as t (t.id)}
    <div class="toast" class:error={t.tone === 'error'} animate:slide out:leave>
      <span>{t.text}</span>
      <button aria-label={m.toast.dismiss} onclick={() => toasts.dismiss(t.id)}><X size={14} /></button>
    </div>
  {/each}
</div>

<style>
  .toaster { position: fixed; left: 50%; top: calc(var(--header-h) + var(--space-4)); translate: -50% 0; z-index: 1000; display: flex; flex-direction: column; gap: var(--space-2); align-items: center; pointer-events: none; }
  .toast {
    display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3) var(--space-4); pointer-events: auto;
    border: 1px solid var(--border-default); border-radius: var(--radius-md); background: var(--surface-4); color: var(--text-strong);
    font: var(--text-sm) var(--font-sans); box-shadow: var(--shadow-popover); animation: rise var(--dur-toast) var(--ease-out);
  }
  .toast.error { border-color: var(--danger); }
  button { display: grid; padding: 0; border: 0; background: none; color: var(--text-secondary); cursor: pointer; }
  @keyframes rise { from { opacity: 0; translate: 0 calc(-1 * var(--space-2) * var(--motion)); } }
</style>
