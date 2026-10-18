<script lang="ts">
  /**
   * The settings layout shared by user, server and channel settings: sections on the left, the section on
   * the right, closed with Escape, Back or the close button. It is a modal over the mounted shell (modal.svelte.ts).
   *
   * The sidebar (m4.6-plan.md task 17, motion spec 4.12): items in labelled groups, and under the open page its
   * sections, an accordion that collapses the old page's list as the new one opens. A bar marks the section, moving
   * at the click while the content scrolls there on a spring; wheel scrolling moves it by scroll-spy.
   */
  import { IconButton, cancelSpringScroll, springScrollTo, springScrolling } from '@concord/ui';
  import { tick, untrack, type Snippet } from 'svelte';
  import X from '@lucide/svelte/icons/x';
  import { m } from '$lib/i18n/index.ts';
  import { settingsModal, settingsUrl, type SettingsTarget } from './modal.svelte.ts';

  /** A section of a page, found in the content by its element's id. */
  export interface FrameSection { id: string; label: string }
  /** A page. Items with a group sit under its label; the first group's label is the title's place. */
  export interface FrameItem { id: string; label: string; target: SettingsTarget; group?: string; sections?: FrameSection[] | undefined }
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
    /** Below the footer, small: the build's version. */
    version?: string;
  }
  let { title, items, active, heading, children, footer, wide = false, version }: Props = $props();
  let root = $state<HTMLElement | null>(null);
  let scroller = $state<HTMLElement | null>(null);
  const sections = $derived(items.find((i) => i.id === active)?.sections ?? []);
  /** The section the bar marks, by id. */
  let current = $state<string | undefined>(undefined);
  /** The bar's place in the open page's list: top and height, in px. */
  let bar = $state<{ y: number; h: number } | null>(null);

  // A page swap shows the new page from its top, with its first section marked (motion spec 4.12).
  // Only `active` counts: the items are derived again on store changes, which must not reset the scroll.
  $effect(() => {
    void active;
    untrack(() => {
      if (scroller) {
        cancelSpringScroll(scroller);
        scroller.scrollTop = 0;
      }
      current = sections[0]?.id;
    });
  });

  // The bar follows the marked section's row, in the same frame.
  $effect(() => {
    const id = current;
    void sections;
    void tick().then(() => {
      const row = id ? root?.querySelector<HTMLElement>(`.subnav.open [data-section="${id}"]`) : null;
      bar = row ? { y: row.offsetTop, h: row.offsetHeight } : null;
    });
  });

  /** Where a section starts in the scroller, a little below its top edge. */
  function offset(id: string): number | undefined {
    const el = document.getElementById(id);
    if (!el || !scroller) return undefined;
    return el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 24;
  }

  /**
   * After a click the bar stays on the clicked section until the reader scrolls themselves: the spring's last scroll
   * event comes after it ends, and near the page's end would otherwise mark the last section instead.
   */
  let pinned = false;
  const unpin = () => (pinned = false);
  const INPUT = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;
  $effect(() => {
    const el = scroller;
    if (!el) return;
    for (const type of INPUT) el.addEventListener(type, unpin, { passive: true });
    return () => { for (const type of INPUT) el.removeEventListener(type, unpin); };
  });

  /** A section's row: the bar moves at once, even when the content can't scroll further, and the content springs there. */
  function jump(id: string) {
    current = id;
    pinned = true;
    const top = offset(id);
    if (scroller && top !== undefined) springScrollTo(scroller, top);
  }

  /** Scroll-spy for wheel and keyboard scrolling: the last section whose top has passed, or the last one at the end. */
  function spy() {
    if (!scroller || pinned || springScrolling(scroller) || !sections.length) return;
    if (scroller.scrollTop >= scroller.scrollHeight - scroller.clientHeight - 1) return void (current = sections.at(-1)!.id);
    let found = sections[0]!.id;
    for (const s of sections) {
      const top = offset(s.id);
      if (top !== undefined && top <= scroller.scrollTop + 1) found = s.id;
    }
    current = found;
  }

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
      {#if !items[0]?.group}<h2>{title}</h2>{/if}
      {#each items as item, i (item.id)}
        {#if item.group && item.group !== items[i - 1]?.group}<h2 class:later={i > 0}>{item.group}</h2>{/if}
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- settingsUrl() resolves -->
        <a class="item" class:active={item.id === active} href={settingsUrl(item.target)} onclick={(e) => pick(e, item)} aria-current={item.id === active ? 'page' : undefined}>{item.label}</a>
        {#if item.sections?.length}
          {@const open = item.id === active}
          <div class="subnav" class:open inert={!open}>
            <div class="sub-inner">
              {#if open && bar}<span class="bar" aria-hidden="true" style:translate="0 {bar.y}px" style:scale="1 {bar.h}"></span>{/if}
              {#each item.sections as s (s.id)}
                <button class="sub" data-section={s.id} class:current={open && current === s.id} aria-current={open && current === s.id ? 'location' : undefined}
                  onclick={() => jump(s.id)}>{s.label}</button>
              {/each}
            </div>
          </div>
        {/if}
      {/each}
      {#if footer}
        <div class="separator" role="separator"></div>
        {@render footer()}
      {/if}
      {#if version}<p class="version">{version}</p>{/if}
    </div>
  </nav>
  <main class="content">
    <!-- A 48 px row with the page's title and the close button, above the scroller (motion spec 4.11). -->
    <header class="head">
      <h1>{heading}</h1>
      <IconButton label={m.settings.close} placement="bottom" onclick={() => void settingsModal.close()}><X /></IconButton>
    </header>
    <div class="scroller" bind:this={scroller} onscroll={spy}>
      <div class="column" class:wide>
        {@render children()}
      </div>
    </div>
  </main>
</div>

<style>
  /* It fills SettingsHost's modal, which insets it over the app and animates it. */
  .settings { display: flex; height: 100%; background: var(--surface-0); }
  .nav { flex: 1 0 auto; display: flex; justify-content: flex-end; background: var(--surface-1); overflow-y: auto; }
  .nav-inner { display: grid; align-content: start; gap: var(--space-1); width: var(--settings-nav-w); padding: var(--space-10) var(--space-3) var(--space-5) var(--space-5); }
  h2 { margin: 0 0 var(--space-3); padding: 0 var(--space-3); color: var(--text-secondary); font: 700 var(--text-xs) var(--font-sans); text-transform: uppercase; letter-spacing: 0.02em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  h2.later { margin-top: var(--space-5); }
  .item { display: flex; align-items: center; min-height: 2.25rem; padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); color: var(--text-secondary); font: 500 var(--text-md) var(--font-sans); text-decoration: none; }
  @media (hover: hover) { .item:hover { background: var(--hover-overlay); color: var(--text-normal); text-decoration: none; } }
  .item.active { background: var(--surface-5); color: var(--text-strong); }
  .subnav { display: grid; grid-template-rows: 0fr; transition: grid-template-rows var(--dur-accordion) var(--ease-out-cubic); }
  /* The accordion: the open page's sections grow in over 300 ms while the old page's shrink away. */
  .subnav.open { grid-template-rows: 1fr; }
  .sub-inner { position: relative; display: grid; min-height: 0; overflow: hidden; margin-left: var(--space-5); padding-left: var(--space-1); border-left: 1px solid var(--border-default); }
  .sub {
    padding: var(--space-2) var(--space-3); border: 0; background: none; color: var(--text-secondary); text-align: left; font: 500 var(--text-sm) var(--font-sans);
    opacity: 0; transition: opacity var(--dur-settings-delay) var(--ease-out);
  }
  .open .sub { opacity: 1; transition: opacity var(--dur-settings-modal) var(--ease-out) var(--dur-settings-delay); }
  @media (hover: hover) { .sub:hover { color: var(--text-strong); } }
  .sub.current { color: var(--text-strong); }
  /* One pixel tall, scaled to the row: it moves by translate and scale only. */
  .bar {
    position: absolute; top: 0; left: -1px; width: 2px; height: 1px; transform-origin: top; background: var(--text-strong);
    transition: translate var(--dur-active-bar) var(--ease-standard), scale var(--dur-active-bar) var(--ease-standard);
  }
  .version { margin: var(--space-3) 0 0; padding: 0 var(--space-3); color: var(--text-muted); font: var(--text-xs) var(--font-sans); }
  .separator { height: 1px; margin: var(--space-3); background: var(--border-default); }
  .nav-inner :global(.button) { justify-content: flex-start; padding: 0 var(--space-3); font-size: var(--text-md); }
  .content { flex: 1 1 calc(var(--settings-col-w) + 10rem); display: flex; flex-direction: column; min-width: 0; min-height: 0; }
  .head {
    display: flex; align-items: center; gap: var(--space-4); flex: none; min-height: var(--header-h); padding: 0 var(--space-3) 0 var(--space-8);
    border-bottom: 1px solid var(--border-faint);
  }
  .head :global(.icon-button) { margin-left: auto; }
  @media (hover: hover) { .head :global(.icon-button:hover) { background: var(--surface-5); } }
  /* flex-start, so the column is as tall as its content and an editor's sticky save bar holds to the bottom. */
  .scroller { flex: 1; display: flex; align-items: flex-start; min-height: 0; overflow-y: auto; }
  /* A container, so a section can lay itself out by the room it really has (ProfileEditor). */
  /* Centred at 700 px, with 20 px section headings (motion spec 4.15, m4.6-plan.md task 18). */
  .column { width: min(var(--settings-col-w), 100%); margin: 0 auto; padding: var(--space-7) var(--space-8) var(--space-8); container: settings / inline-size; }
  .column.wide { width: min(var(--settings-col-wide-w), 100%); }
  .column :global(section > h2) { font: 600 var(--text-lg) var(--font-sans); color: var(--text-strong); text-transform: none; letter-spacing: normal; }
  h1 { margin: 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-strong); font: 600 var(--text-md) var(--font-sans); }
  @media (max-width: 800px) {
    .settings { flex-direction: column; }
    .nav { flex: none; justify-content: flex-start; }
    .nav-inner { width: 100%; padding: var(--space-5) var(--space-4); grid-auto-flow: column; justify-content: start; align-items: center; overflow-x: auto; }
    /* No accordion at phone width (decision 2). */
    h2, .separator, .subnav, .version { display: none; }
    .column { padding: var(--space-5) var(--space-4); }
    .head { padding-left: var(--space-4); }
  }
</style>
