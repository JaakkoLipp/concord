<script lang="ts">
  /**
   * The settings layout shared by user, server and channel settings: sections on the left, the section on
   * the right, closed with Escape, Back or the close button. It is a modal over the mounted shell (modal.svelte.ts).
   */
  import { IconButton } from '@concord/ui';
  import type { Snippet } from 'svelte';
  import X from '@lucide/svelte/icons/x';
  import { m } from '$lib/i18n/index.ts';
  import { settingsModal, settingsUrl, type SettingsTarget } from './modal.svelte.ts';

  export interface FrameItem { id: string; label: string; target: SettingsTarget }
  interface Props {
    title: string;
    items: FrameItem[];
    active: string;
    heading: string;
    children: Snippet;
    /** Below the sections, after a separator: log out, delete server and the like. */
    footer?: Snippet;
    /** A wider column, for a section with a preview beside its form. */
    wide?: boolean;
  }
  let { title, items, active, heading, children, footer, wide = false }: Props = $props();
  let root = $state<HTMLElement | null>(null);

  // Focus moves into settings as it opens, onto the open section's item.
  $effect(() => {
    root?.querySelector<HTMLElement>('.item.active')?.focus({ preventScroll: true });
  });

  /** A section is a link, so it can open in a new tab, but a plain click switches in place. */
  function pick(e: MouseEvent, item: FrameItem) {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    void settingsModal.go(item.target);
  }

  // Menus and popovers take their Escape in capture phase and stop it. A native dialog's cancel comes after this.
  function key(e: KeyboardEvent) {
    if (e.key === 'Escape' && !e.defaultPrevented && !document.querySelector('dialog[open]')) void settingsModal.close();
  }
</script>

<svelte:window onkeydown={key} />

<div class="settings" bind:this={root} role="dialog" aria-modal="true" aria-label={title}>
  <nav class="nav" aria-label={title}>
    <div class="nav-inner">
      <h2>{title}</h2>
      {#each items as item (item.id)}
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- settingsUrl() resolves -->
        <a class="item" class:active={item.id === active} href={settingsUrl(item.target)} onclick={(e) => pick(e, item)} aria-current={item.id === active ? 'page' : undefined}>{item.label}</a>
      {/each}
      {#if footer}
        <div class="separator" role="separator"></div>
        {@render footer()}
      {/if}
    </div>
  </nav>
  <main class="content">
    <div class="column" class:wide>
      <h1>{heading}</h1>
      {@render children()}
    </div>
    <div class="close"><IconButton label={m.settings.close} onclick={() => void settingsModal.close()}><X /></IconButton></div>
  </main>
</div>

<style>
  /* Full-screen over the mounted shell until task 16b insets it. It fades in when opened, without a scale, and closes at once. */
  .settings { position: fixed; inset: 0; z-index: 800; display: flex; background: var(--surface-0); animation: page-in var(--dur-modal) var(--ease-out); }
  @keyframes page-in { from { opacity: 0; } }
  .nav { flex: 1 0 auto; display: flex; justify-content: flex-end; background: var(--surface-1); overflow-y: auto; }
  .nav-inner { display: grid; align-content: start; gap: var(--space-1); width: var(--settings-nav-w); padding: var(--space-10) var(--space-3) var(--space-5) var(--space-5); }
  h2 { margin: 0 0 var(--space-3); padding: 0 var(--space-3); color: var(--text-secondary); font: 700 var(--text-xs) var(--font-sans); text-transform: uppercase; letter-spacing: 0.02em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .item { display: block; padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); color: var(--text-secondary); font: 500 var(--text-md) var(--font-sans); text-decoration: none; }
  @media (hover: hover) { .item:hover { background: var(--hover-overlay); color: var(--text-normal); text-decoration: none; } }
  .item.active { background: var(--surface-5); color: var(--text-strong); }
  .separator { height: 1px; margin: var(--space-3); background: var(--border-default); }
  .nav-inner :global(.button) { justify-content: flex-start; padding: 0 var(--space-3); font-size: var(--text-md); }
  .content { flex: 1 1 calc(var(--settings-col-w) + 10rem); display: flex; align-items: flex-start; overflow-y: auto; }
  /* A container, so a section can lay itself out by the room it really has (ProfileEditor). */
  .column { width: min(var(--settings-col-w), 100%); padding: var(--space-10) var(--space-8) var(--space-8); container: settings / inline-size; }
  .column.wide { width: min(var(--settings-col-wide-w), 100%); }
  h1 { margin: 0 0 var(--space-7); color: var(--text-strong); font: 700 var(--text-xl) var(--font-sans); }
  .close { position: sticky; top: 0; padding: var(--space-10) var(--space-5) 0; }
  @media (max-width: 800px) {
    .settings { flex-direction: column; }
    .nav { flex: none; justify-content: flex-start; }
    .nav-inner { width: 100%; padding: var(--space-5) var(--space-4); grid-auto-flow: column; justify-content: start; align-items: center; overflow-x: auto; }
    h2, .separator { display: none; }
    .column { padding: var(--space-5) var(--space-4); }
    .close { position: absolute; top: var(--space-3); right: var(--space-3); padding: 0; }
  }
</style>
