<script lang="ts">
  /**
   * One tile in the call view (client.md section 10.3): a person, shown by their camera when it is on and by
   * their avatar otherwise, or a screen share. Clicking focuses it and double-clicking makes it full screen;
   * from the keyboard, Enter focuses and F goes full screen. Right-click or a long press opens its menu.
   */
  import Volume1 from '@lucide/svelte/icons/volume-1';
  import VolumeX from '@lucide/svelte/icons/volume-x';
  import type { Snippet } from 'svelte';
  import { untrack } from 'svelte';
  import { Avatar, enter, leave, type MenuItem } from '@concord/ui';
  import MicOff from '@lucide/svelte/icons/mic-off';
  import ScreenShare from '@lucide/svelte/icons/screen-share';
  import { m } from '$lib/i18n/index.ts';
  import { menuOn } from '$lib/view/contextmenu.svelte.ts';
  import type { Feed } from '$lib/voice/call.ts';

  interface Props {
    name: string;
    avatar: string;
    /** The camera or screen to show, if any. */
    feed?: Feed | undefined;
    screen?: boolean;
    talking?: boolean;
    muted?: boolean;
    focused: boolean;
    /** In the strip under a focused tile: a smaller avatar and label. */
    small?: boolean;
    /** Extra words for screen readers, such as "you" or "muted". */
    states: string[];
    ontoggle: () => void;
    menu: (tile: HTMLElement, fullscreen: () => void) => MenuItem[];
    /** Drawn over the picture, such as the stats overlay. */
    children?: Snippet;
    /** Someone who joined while the call view was showing: the tile fades in. */
    appear?: boolean;
    /** This device's volume for them, in percent, marked when it isn't 100 (m4.5-plan.md task 5). */
    volume?: number;
  }
  let { name, avatar, feed, screen = false, talking = false, muted = false, focused, small = false, states, ontoggle, menu, children, appear = false, volume = 100 }: Props = $props();
  // As the tile was created: the transition reads it later, after the call view has marked the tile seen.
  const appearing = untrack(() => appear);
  let tile = $state<HTMLElement | null>(null);

  function fullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void tile?.requestFullscreen().catch(() => {});
  }

  /** Plays a feed in this tile's video element, moving to a new feed when it changes. */
  function play(el: HTMLVideoElement, f: Feed) {
    let current = f;
    current.attach(el);
    return {
      update(next: Feed) {
        if (next === current) return;
        current.detach(el);
        current = next;
        current.attach(el);
      },
      destroy() { current.detach(el); },
    };
  }
</script>

<!-- Someone joining fades in and someone leaving fades out. -->
<div class="tile" class:focused class:talking class:screen class:small bind:this={tile} in:enter={{ instant: !appearing }} out:leave>
  {#if feed && !feed.watching}
    <!-- Someone's stream, not received until watched (m4.5-plan.md task 6). -->
    <span class="avatar"><Avatar src={avatar} size={small ? 40 : 80} /></span>
    <button class="watch" onclick={() => feed.watch(true)}>{m.call.watchStream}</button>
  {:else if feed}
    <video use:play={feed} class:mirror={feed.local && feed.source === 'camera'} autoplay playsinline muted></video>
  {:else}
    <span class="avatar"><Avatar src={avatar} size={small ? 40 : 80} /></span>
  {/if}
  {@render children?.()}
  {#if screen && small}<span class="live" aria-hidden="true">{m.call.live}</span>{/if}
  <span class="label">
    {#if muted}<MicOff class="muted-mark" size={16} aria-hidden="true" />{/if}
    {#if screen}<ScreenShare size={16} aria-hidden="true" />{/if}
    <span>{screen ? m.call.screenOf(name) : name}</span>
    {#if volume !== 100}<span class="volume" title={m.call.volumeMark(volume)} aria-hidden="true">{#if volume === 0}<VolumeX size={16} />{:else}<Volume1 size={16} />{/if}</span>{/if}
  </span>
  <button
    class="hit" aria-pressed={focused} aria-label={m.call.tile(screen ? m.call.screenOf(name) : name, states)} title={m.call.tileHelp}
    onclick={ontoggle} ondblclick={fullscreen}
    onkeydown={(e) => { if (e.key === 'f' || e.key === 'F') { e.preventDefault(); fullscreen(); } }}
    use:menuOn={() => (tile ? menu(tile, fullscreen) : [])}
  ></button>
</div>

<style>
  .tile {
    position: relative; display: grid; place-items: center; min-width: 0; aspect-ratio: 16 / 9; overflow: hidden;
    border-radius: var(--radius-lg); background: var(--surface-3);
  }
  /* The speaking ring sits inside the tile, so the grid's gaps never clip it. */
  .tile::after {
    content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
    box-shadow: inset 0 0 0 3px var(--status-online); opacity: 0; transition: opacity var(--dur-state) var(--ease-out);
  }
  .talking::after { opacity: 1; }
  .tile:fullscreen { border-radius: 0; aspect-ratio: auto; }
  video { width: 100%; height: 100%; object-fit: cover; background: var(--surface-0); }
  .screen video, .tile:fullscreen video { object-fit: contain; }
  .mirror { scale: -1 1; }
  .avatar { display: grid; border-radius: var(--radius-full); }
  .label {
    position: absolute; left: var(--space-3); bottom: var(--space-3); display: flex; align-items: center; gap: var(--space-2); max-width: calc(100% - 2 * var(--space-3));
    padding: var(--space-1) var(--space-3); border-radius: var(--radius-md); background: var(--scrim); color: var(--text-strong);
    font: 500 var(--text-sm) var(--font-sans);
  }
  .small .label { left: var(--space-2); bottom: var(--space-2); max-width: calc(100% - 2 * var(--space-2)); padding: 0 var(--space-2); font: 500 var(--text-xs) var(--font-sans); }
  .label span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .label :global(svg) { flex: none; }
  .label :global(svg.muted-mark) { color: var(--danger); }
  /* A stream in the strip (m4.6-plan.md task 12b). */
  .live {
    position: absolute; top: var(--space-2); right: var(--space-2); padding: 0 var(--space-2); border-radius: var(--radius-xs);
    background: var(--danger-fill); color: var(--on-danger); font: 700 0.625rem/1rem var(--font-sans); letter-spacing: 0.02em;
  }
  .hit { position: absolute; inset: 0; z-index: 1; padding: 0; border: 0; border-radius: inherit; background: none; cursor: pointer; }
  .hit:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .volume { display: inline-grid; color: var(--text-secondary); }
  /* Above the tile's own button, which covers it for focus and the menu. */
  .watch {
    position: absolute; z-index: 2; top: calc(50% + 3.5rem); padding: var(--space-2) var(--space-5); border: 0; border-radius: var(--radius-md);
    background: var(--scrim); color: var(--text-strong); font: 600 var(--text-sm) var(--font-sans);
  }
  .small .watch { top: auto; bottom: var(--space-8); padding: var(--space-1) var(--space-3); font-size: var(--text-xs); }
  @media (hover: hover) { .watch:hover { background: var(--accent); color: var(--on-accent); } }
</style>
