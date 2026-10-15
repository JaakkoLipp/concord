<script lang="ts">
  /**
   * Favourite GIFs (m4.5 follow-up), opened from the composer's GIF button: the GIFs this account starred in chat,
   * newest first, as on Discord but with no search, so no GIF service is ever contacted. Picking one sends its link,
   * which Stoat's January embeds as the GIF. Everything shown loads through January.
   */
  import type { FavouriteGif, Store } from '@concord/domain';
  import { Popover } from '@concord/ui';
  import { m } from '$lib/i18n/index.ts';
  import { proxied } from '$lib/view/media.ts';
  import GifStar from '$lib/conversation/GifStar.svelte';

  interface Props { store: Store; anchor: HTMLElement | null; open: boolean; onclose: () => void; onpick: (gif: FavouriteGif) => void }
  let { store, anchor, open, onclose, onpick }: Props = $props();
  const still = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** GIFs whose media no longer loads, such as one deleted at its site: shown as a tile that can still be unstarred. */
  let broken = $state<Record<string, true>>({});
  const fail = (url: string) => () => (broken = { ...broken, [url]: true });

  /** Plays a GIF's video only while it's in view, so a long list doesn't play every one at once. */
  function playInView(el: HTMLVideoElement) {
    if (still) return;
    const io = new IntersectionObserver(([entry]) => { if (entry?.isIntersecting) void el.play().catch(() => {}); else el.pause(); });
    io.observe(el);
    return { destroy: () => io.disconnect() };
  }
</script>

<Popover {anchor} {open} {onclose} side="top" label={m.gifs.picker}>
  <div class="picker">
    <h3>{m.gifs.picker}</h3>
    {#if store.favouriteGifs.length}
      <div class="grid">
        {#each store.favouriteGifs as gif (gif.url)}
          <div class="item has-star" style:aspect-ratio="{gif.width || 1} / {gif.height || 1}">
            {#if broken[gif.url]}
              <span class="gone">{m.gifs.unavailable}</span>
            {:else if gif.video}
              <video src={proxied(gif.src)} muted loop playsinline preload="metadata" use:playInView onerror={fail(gif.url)}></video>
            {:else}
              <img src={proxied(gif.src)} alt="" loading="lazy" decoding="async" draggable="false" onerror={fail(gif.url)} />
            {/if}
            <button class="send" aria-label={m.gifs.send} onclick={() => onpick(gif)}></button>
            <GifStar {gif} />
          </div>
        {/each}
      </div>
    {:else}
      <p class="empty">{m.gifs.empty}</p>
    {/if}
  </div>
</Popover>

<style>
  .picker { display: grid; grid-template-rows: auto 1fr; gap: var(--space-3); width: min(26rem, calc(100vw - 2 * var(--space-4))); height: min(28rem, 60vh); padding: var(--space-4); }
  h3 { margin: 0; color: var(--text-secondary); font: 700 var(--text-xs) var(--font-sans); letter-spacing: 0.02em; text-transform: uppercase; }
  /* Two columns that fill top to bottom, so GIFs of any shape pack without gaps, as on Discord. */
  .grid { columns: 2; column-gap: var(--space-2); overflow-y: auto; }
  .item { position: relative; margin-bottom: var(--space-2); overflow: hidden; break-inside: avoid; border-radius: var(--radius-md); background: var(--surface-3); }
  .item video, .item img { display: block; width: 100%; height: 100%; object-fit: cover; }
  .gone { display: grid; place-items: center; height: 100%; min-height: 4rem; padding: var(--space-2); color: var(--text-secondary); font: var(--text-xs) var(--font-sans); text-align: center; }
  .send { position: absolute; inset: 0; padding: 0; border: 0; background: none; cursor: pointer; }
  .send:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; border-radius: inherit; }
  @media (hover: hover) { .send:hover { background: var(--hover-overlay); } }
  .empty { align-self: center; margin: 0; padding: 0 var(--space-6); color: var(--text-secondary); font: var(--text-sm) var(--font-sans); text-align: center; }
</style>
