<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import { tooltip } from './tooltip.ts';

  interface Props extends HTMLButtonAttributes {
    /** Accessible name and tooltip text, from the message catalogue. */
    label: string;
    active?: boolean;
    size?: 'md' | 'sm';
    children: Snippet;
  }
  let { label, active = false, size = 'md', children, type = 'button', ...rest }: Props = $props();
</script>

<button {...rest} {type} class="icon-button {size}" class:active aria-label={label} use:tooltip={label}>
  {@render children()}
</button>

<style>
  .icon-button {
    display: inline-grid; place-items: center;
    width: 2rem; height: 2rem; padding: 0;
    border: 0; border-radius: var(--radius-md);
    background: transparent; color: var(--text-secondary);
    transition: background var(--dur-hover) var(--ease-out), color var(--dur-hover) var(--ease-out);
  }
  .sm { width: 1.5rem; height: 1.5rem; }
  .icon-button:hover:not(:disabled) { background: var(--hover-overlay); color: var(--text-strong); }
  .active { color: var(--text-strong); }
  .icon-button:disabled { opacity: 0.4; cursor: not-allowed; }
  .icon-button :global(svg) { width: var(--icon-md); height: var(--icon-md); }
  .sm :global(svg) { width: var(--icon-sm); height: var(--icon-sm); }
</style>
