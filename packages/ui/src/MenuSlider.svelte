<script lang="ts">
  /** A Menu's slider row: the label with the current value, and the range under it. Moving it keeps the menu open. */
  import type { MenuRange } from './types.ts';
  let { item }: { item: MenuRange } = $props();
  // The menu's items are a snapshot taken when it opened; the slider keeps its own value from there.
  // svelte-ignore state_referenced_locally
  let value = $state(item.value);
</script>

<label class="range">
  <span class="head"><span>{item.label}</span><span class="value">{item.format(value)}</span></span>
  <input type="range" min={item.min} max={item.max} step={item.step ?? 1} bind:value oninput={() => item.oninput(value)} />
</label>

<style>
  .range { display: grid; gap: var(--space-2); padding: var(--space-2) var(--space-3) var(--space-3); color: var(--text-normal); font: 500 var(--text-sm) var(--font-sans); }
  .head { display: flex; justify-content: space-between; gap: var(--space-4); }
  .value { color: var(--text-secondary); font-variant-numeric: tabular-nums; }
  input { width: 100%; margin: 0; accent-color: var(--accent); }
  input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
