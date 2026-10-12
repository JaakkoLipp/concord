<script lang="ts">
  /** A mention count pill, white on --danger-fill (client.md section 9). */
  interface Props { count: number; label?: string | undefined }
  let { count, label }: Props = $props();
</script>

<span class="badge" aria-label={label}>{count > 99 ? '99+' : count}</span>

<style>
  .badge {
    display: inline-grid; place-items: center; min-width: 1rem; height: 1rem; padding: 0 0.3125rem;
    border-radius: var(--radius-full); background: var(--danger-fill); color: var(--on-danger);
    font: 700 var(--text-xs) var(--font-sans); font-size: 0.6875rem; line-height: 1rem;
    font-variant-numeric: tabular-nums;
  }
</style>
