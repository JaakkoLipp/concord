<script lang="ts">
  /**
   * A row of tabs. Arrow keys move between them and select, as the ARIA tabs pattern describes. The page
   * renders the selected panel, labelled by `tab-<id>`.
   */
  import Badge from './Badge.svelte';
  import type { Tab } from './types.ts';
  interface Props { tabs: Tab[]; selected: string; label: string; onselect: (id: string) => void }
  let { tabs, selected, label, onselect }: Props = $props();
  let list = $state<HTMLDivElement | null>(null);

  function key(e: KeyboardEvent) {
    const i = tabs.findIndex((t) => t.id === selected);
    const next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const tab = tabs[(next + tabs.length) % tabs.length]!;
    onselect(tab.id);
    list?.querySelector<HTMLElement>(`#tab-${CSS.escape(tab.id)}`)?.focus();
  }
</script>

<div class="tabs" role="tablist" aria-label={label} bind:this={list} tabindex="-1" onkeydown={key}>
  {#each tabs as tab (tab.id)}
    <button role="tab" id="tab-{tab.id}" class:selected={tab.id === selected} aria-selected={tab.id === selected} tabindex={tab.id === selected || (!tabs.some((t) => t.id === selected) && tab === tabs[0]) ? 0 : -1} onclick={() => onselect(tab.id)}>
      {tab.label}
      {#if tab.badge}<Badge count={tab.badge} label={tab.badgeLabel} />{/if}
    </button>
  {/each}
</div>

<style>
  .tabs { display: flex; align-items: center; gap: var(--space-3); min-width: 0; outline: none; }
  button {
    display: inline-flex; align-items: center; gap: var(--space-3); min-height: 1.75rem; padding: 0 var(--space-4);
    border: 0; border-radius: var(--radius-md); background: none; color: var(--text-secondary);
    font: 500 var(--text-md) var(--font-sans); white-space: nowrap;
  }
  @media (hover: hover) { button:hover { background: var(--hover-overlay); color: var(--text-normal); } }
  button.selected { background: var(--surface-5); color: var(--text-strong); }
</style>
