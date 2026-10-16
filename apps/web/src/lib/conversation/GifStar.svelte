<script lang="ts">
  /**
   * The star on a GIF (m4.5 follow-up), as on Discord: adds it to this account's favourite GIFs, or removes it.
   * It shows when the GIF is hovered or focused, and always on touch screens, which have no hover.
   */
  import type { FavouriteGif } from '@concord/domain';
  import Star from '@lucide/svelte/icons/star';
  import { m } from '$lib/i18n/index.ts';
  import { app } from '$lib/session/app.svelte.ts';

  let { gif }: { gif: FavouriteGif } = $props();
  const on = $derived(!!app.session?.store.favouriteGifs.some((g) => g.url === gif.url));
</script>

{#if app.session}
  {@const session = app.session}
  <button class="star" class:on aria-pressed={on} aria-label={on ? m.gifs.unfavourite : m.gifs.favourite} title={on ? m.gifs.unfavourite : m.gifs.favourite}
    onclick={(e) => { e.stopPropagation(); session.toggleFavouriteGif(gif); }}>
    <Star size={18} fill={on ? 'currentColor' : 'none'} />
  </button>
{/if}

<style>
  .star {
    position: absolute; top: var(--space-2); right: var(--space-2); z-index: 1; display: grid; place-items: center; width: 2rem; height: 2rem; padding: 0;
    border: 0; border-radius: var(--radius-md); background: var(--scrim); color: var(--text-strong); opacity: 0;
  }
  .star.on { color: var(--status-idle); }
  .star:focus-visible { opacity: 1; }
  :global(.has-star:hover) .star, :global(.has-star:focus-within) .star { opacity: 1; }
  @media (hover: none) { .star { opacity: 1; } }
  @media (hover: hover) { .star:hover { color: var(--status-idle); } }
</style>
