<script lang="ts">
  /** The bar an editor shows while it has unsaved changes: Reset and Save. */
  import { Button } from '@concord/ui';
  import { m } from '$lib/i18n/index.ts';

  let { saving, valid, onreset, onsave }: { saving: boolean; valid: boolean; onreset: () => void; onsave: () => void } = $props();
</script>

<div class="unsaved" role="status">
  <span>{m.admin.unsaved}</span>
  <Button size="sm" variant="ghost" onclick={onreset}>{m.admin.reset}</Button>
  <Button size="sm" onclick={onsave} busy={saving} disabled={!valid}>{m.admin.save}</Button>
</div>

<style>
  .unsaved {
    position: sticky; bottom: var(--space-5); display: flex; align-items: center; gap: var(--space-4); margin-top: var(--space-8);
    padding: var(--space-3) var(--space-3) var(--space-3) var(--space-5); border-radius: var(--radius-lg);
    background: var(--surface-4); border: 1px solid var(--border-default); box-shadow: var(--shadow-popover);
  }
  .unsaved span { flex: 1; color: var(--text-strong); font: 500 var(--text-sm) var(--font-sans); }
</style>
