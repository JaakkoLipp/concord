<script lang="ts">
  import type { Embed, FavouriteGif } from '@concord/domain';
  import GifStar from './GifStar.svelte';
  import { fileUrl } from '@concord/stoat';
  import Play from '@lucide/svelte/icons/play';
  import Markdown from '$lib/markdown/Markdown.svelte';
  import { m } from '$lib/i18n/index.ts';
  import { fit, proxied } from '$lib/view/media.ts';
  import { viewer } from '$lib/view/viewer.svelte.ts';

  let { embed }: { embed: Embed } = $props();
  // Embeds come from senders; only http and https become links (client.md section 6.2).
  const safe = (url: string | undefined) => (url && /^https?:\/\//i.test(url) ? url : undefined);
  const link = $derived(embed.kind === 'website' || embed.kind === 'text' ? safe(embed.url) : undefined);
  const colour = $derived(embed.kind === 'website' || embed.kind === 'text' ? embed.colour : undefined);
  // January marks GIF sites (KLIPY, Giphy, Tenor) as special GIFs, with the animation as a video or an image.
  const gif = $derived(embed.kind === 'website' && embed.special?.type === 'other' && embed.special.name === 'GIF' ? (embed.video ?? embed.image) : undefined);
  // GIFs play by themselves, as on Discord, unless the system asks for reduced motion: then they wait for a click.
  const still = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Favourite GIFs (m4.5 follow-up): what a star saves. The link is what gets sent again; the media shows it.
  const websiteGif = $derived.by((): FavouriteGif | undefined => {
    const url = safe(embed.url);
    const media = gif && embed.kind === 'website' ? (embed.video ?? gif) : undefined;
    const src = safe(media?.url);
    return url && media && src ? { url, src, video: !!(embed.kind === 'website' && embed.video), width: media.width, height: media.height } : undefined;
  });
  /** An image linked straight, which is a GIF by its address, such as media.giphy.com/…/giphy.gif. */
  function imageGif(url: string, width: number, height: number): FavouriteGif | undefined {
    const web = safe(url);
    if (!web) return undefined;
    try {
      return /\.gif$/i.test(new URL(web).pathname) ? { url: web, src: web, video: false, width, height } : undefined;
    } catch {
      return undefined;
    }
  }
</script>

{#if embed.kind === 'image'}
  {@const size = fit(embed.width, embed.height, 400, 300)}
  {@const fav = imageGif(embed.url, embed.width, embed.height)}
  <!-- A GIF linked straight can be starred: the star sits beside the button, which can't hold another. -->
  <span class="frame" class:has-star={!!fav} style:width="{size.width}px" data-gif={fav ? JSON.stringify(fav) : undefined}>
    <button class="media" style:width="{size.width}px" style:aspect-ratio="{size.width} / {size.height}" aria-label={m.conversation.viewImage('')}
      onclick={() => viewer.open({ src: proxied(embed.url), alt: '', width: embed.width, height: embed.height, original: safe(embed.url) })}>
      <img src={proxied(embed.url)} data-original={embed.url} alt="" loading="lazy" decoding="async" />
    </button>
    {#if fav}<GifStar gif={fav} />{/if}
  </span>
{:else if embed.kind === 'video'}
  {@const size = fit(embed.width, embed.height, 400, 300)}
  <!-- svelte-ignore a11y_media_has_caption -->
  <video class="media" controls preload="metadata" src={proxied(embed.url)} width={size.width} style:aspect-ratio="{size.width} / {size.height}"></video>
{:else if gif && embed.kind === 'website'}
  {@const size = fit(gif.width, gif.height, 400, 300)}
  {@const fav = websiteGif}
  <div class="media gif" class:has-star={!!fav} style:width="{size.width}px" style:aspect-ratio="{size.width} / {size.height}" data-gif={fav ? JSON.stringify(fav) : undefined}>
    {#if embed.video}
      <video src={proxied(embed.video.url)} autoplay={!still} controls={still} loop muted playsinline aria-label={embed.title ?? m.conversation.gif}></video>
    {:else}
      <img src={proxied(gif.url)} data-original={gif.url} alt={embed.title ?? m.conversation.gif} loading="lazy" decoding="async" />
    {/if}
    <span class="badge" aria-hidden="true">{m.conversation.gif}</span>
    {#if fav}<GifStar gif={fav} />{/if}
  </div>
{:else}
  <article class="card" style:--embed={colour}>
    <div class="text">
      {#if embed.kind === 'website' && embed.siteName}<p class="site">{embed.siteName}</p>{/if}
      {#if embed.title}
        {#if link}<a class="title" href={link} target="_blank" rel="noopener noreferrer">{embed.title}</a>{:else}<p class="title">{embed.title}</p>{/if}
      {/if}
      {#if embed.description}
        <div class="description">{#if embed.kind === 'text'}<Markdown source={embed.description} />{:else}{embed.description}{/if}</div>
      {/if}
    </div>
    {#if embed.kind === 'website' && embed.video && embed.special?.type !== 'youtube'}
      <!-- A site's own video (og:video), such as a clip, plays here with its preview image as the poster. -->
      {@const size = fit(embed.video.width, embed.video.height, 400, 300)}
      <!-- svelte-ignore a11y_media_has_caption -->
      <video class="media large" controls preload="metadata" src={proxied(embed.video.url)} poster={embed.image ? proxied(embed.image.url) : undefined}
        width={size.width} style:aspect-ratio="{size.width} / {size.height}"></video>
    {:else if embed.kind === 'website' && embed.image}
      {@const img = embed.image}
      {@const large = img.size === 'large' || !!embed.special}
      {@const size = large ? fit(img.width, img.height, 400, 300) : fit(img.width, img.height, 80, 80)}
      {#if embed.special?.type === 'youtube' && link}
        <a class="media large video-link" href={link} target="_blank" rel="noopener noreferrer" style:width="{size.width}px" style:aspect-ratio="{size.width} / {size.height}" aria-label={m.conversation.playVideo}>
          <img src={proxied(img.url)} data-original={img.url} alt="" loading="lazy" />
          <span class="play" aria-hidden="true"><Play size={28} /></span>
        </a>
      {:else}
        <button class="media" class:large class:thumb={!large} style:width="{size.width}px" style:aspect-ratio="{size.width} / {size.height}" aria-label={m.conversation.viewImage(embed.title ?? '')}
          onclick={() => viewer.open({ src: proxied(img.url), alt: embed.title ?? '', width: img.width, height: img.height, original: safe(img.url) })}>
          <img src={proxied(img.url)} data-original={img.url} alt="" loading="lazy" decoding="async" />
        </button>
      {/if}
    {:else if embed.kind === 'text' && embed.media}
      <img class="media large" src={fileUrl(embed.media, { maxSide: 800 })} data-original={fileUrl(embed.media)} data-name={embed.media.filename} alt="" loading="lazy" />
    {/if}
  </article>
{/if}

<style>
  .card {
    display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--space-4); max-width: 32rem; margin-top: var(--space-2);
    padding: var(--space-4) var(--space-5); border: 1px solid var(--border-default); border-left: 4px solid var(--embed, var(--border-control));
    border-radius: var(--radius-md); background: var(--surface-1);
  }
  .text { display: grid; gap: var(--space-2); min-width: 0; }
  .site { margin: 0; color: var(--text-secondary); font: var(--text-xs) var(--font-sans); }
  .title { margin: 0; color: var(--link); font: 700 var(--text-md) var(--font-sans); }
  p.title { color: var(--text-strong); }
  .description { color: var(--text-normal); font: var(--text-sm) var(--font-sans); overflow-wrap: anywhere; white-space: pre-line; }
  .media {
    position: relative; display: block; max-width: 100%; height: auto; padding: 0; margin-top: var(--space-2);
    border: 0; border-radius: var(--radius-md); overflow: hidden; background: var(--surface-2); cursor: zoom-in;
  }
  .media img { width: 100%; height: 100%; object-fit: cover; }
  .card .large { grid-column: 1 / -1; }
  .thumb { margin-top: 0; }
  .video-link { cursor: pointer; }
  .play { position: absolute; inset: 0; display: grid; place-items: center; color: #fff; filter: drop-shadow(0 1px 4px #000); }
  video.media { cursor: auto; background: #000; }
  .gif { cursor: auto; }
  .frame { position: relative; display: block; max-width: 100%; }
  .gif video, .gif img { display: block; width: 100%; height: 100%; object-fit: cover; }
  .badge {
    position: absolute; top: var(--space-3); left: var(--space-3); padding: var(--space-1) var(--space-3); border-radius: var(--radius-xs);
    background: var(--scrim); color: var(--text-strong); font: 700 var(--text-xs) var(--font-sans);
  }
</style>
