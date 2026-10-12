<script lang="ts">
  /** The composer at its real size, disabled until M2 (m1-plan.md). */
  import Plus from '@lucide/svelte/icons/plus';
  import Smile from '@lucide/svelte/icons/smile';
  import { m } from '$lib/i18n/index.ts';

  let { placeholder }: { placeholder: string } = $props();
</script>

<div class="composer" aria-disabled="true">
  <span class="icon" aria-hidden="true"><Plus size={22} /></span>
  <span class="placeholder">{placeholder}</span>
  <span class="readonly">{m.shell.readOnly}</span>
  <span class="icon" aria-hidden="true"><Smile size={22} /></span>
</div>

<style>
  .composer {
    display: flex; align-items: center; gap: var(--space-4); min-height: var(--composer-h); margin: 0 var(--space-5) var(--space-5);
    padding: 0 var(--space-5); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); background: var(--surface-2);
    color: var(--text-secondary); cursor: not-allowed;
  }
  .icon { display: grid; color: var(--text-secondary); }
  .placeholder { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: var(--text-md) var(--font-sans); }
  .readonly { color: var(--text-muted); font: var(--text-xs) var(--font-sans); white-space: nowrap; }
</style>
