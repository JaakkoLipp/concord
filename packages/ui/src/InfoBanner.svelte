<script lang="ts">
  /**
   * The one information banner (m4.6-plan.md task 18, motion spec 4.15): a dark fill, a 1 px accent edge and an
   * info mark. It explains a state, such as a locked role or a blocked permission, so it has no dismiss.
   */
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  interface Props extends HTMLAttributes<HTMLDivElement> { children: Snippet }
  let { children, class: extra = '', ...rest }: Props = $props();
</script>

<div {...rest} class="info-banner {extra}">
  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
  <p>{@render children()}</p>
</div>

<style>
  .info-banner {
    display: flex; align-items: flex-start; gap: var(--space-3); padding: var(--space-3) var(--space-4);
    border: 1px solid var(--accent); border-radius: var(--radius-md); background: var(--surface-1);
  }
  svg { flex: none; width: var(--icon-md); height: var(--icon-md); fill: none; stroke: var(--accent); stroke-width: 2; stroke-linecap: round; }
  p { margin: 0; color: var(--text-normal); font: var(--text-sm) var(--font-sans); }
</style>
