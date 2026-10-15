<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  interface Props extends HTMLButtonAttributes {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
    size?: 'md' | 'sm';
    wide?: boolean;
    busy?: boolean;
    children: Snippet;
  }
  let { variant = 'primary', size = 'md', wide = false, busy = false, children, disabled, type = 'button', ...rest }: Props = $props();
</script>

<button {...rest} {type} class="button {variant} {size}" class:wide disabled={disabled || busy} aria-busy={busy || undefined}>
  {@render children()}
</button>

<style>
  .button {
    display: inline-flex; align-items: center; justify-content: center; gap: var(--space-3);
    min-height: var(--control-h); padding: 0 var(--space-5);
    border: 1px solid transparent; border-radius: var(--radius-md);
    font: 500 var(--text-sm) var(--font-sans);
    transition: background-color var(--dur-hover) var(--ease-out), border-color var(--dur-hover) var(--ease-out), scale var(--dur-press) var(--ease-out);
  }
  /* A press gives slightly (client.md section 9). */
  .button:active:not(:disabled) { scale: calc(1 - 0.02 * var(--motion)); }
  .sm { min-height: 2rem; padding: 0 var(--space-4); }
  .wide { width: 100%; }
  .primary { background: var(--accent); color: var(--on-accent); }
  @media (hover: hover) { .primary:hover:not(:disabled) { background: var(--accent-hover); } }
  .primary:active:not(:disabled) { background: var(--accent-active); }
  .secondary { background: var(--surface-4); color: var(--text-strong); border-color: var(--border-default); }
  @media (hover: hover) { .secondary:hover:not(:disabled) { background: var(--surface-5); } }
  .danger { background: var(--danger-fill); color: var(--on-danger); }
  @media (hover: hover) { .danger:hover:not(:disabled) { filter: brightness(1.1); } }
  .ghost { background: transparent; color: var(--text-secondary); }
  @media (hover: hover) { .ghost:hover:not(:disabled) { background: var(--hover-overlay); color: var(--text-strong); } }
  .button:disabled { opacity: 0.5; cursor: not-allowed; }
  .button[aria-busy='true'] { cursor: progress; }
</style>
