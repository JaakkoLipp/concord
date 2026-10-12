<script lang="ts">
  import type { Embed } from '@concord/domain';
  import { fileUrl } from '@concord/stoat';
  import Play from '@lucide/svelte/icons/play';
  import Markdown from '$lib/markdown/Markdown.svelte';
  import { m } from '$lib/i18n/index.ts';
  import { fit, proxied } from '$lib/view/media.ts';
  import { viewer } from '$lib/view/viewer.svelte.ts';

  let { embed }: { embed: Embed } = $props();
  const colour = $derived(embed.kind === 'website' || embed.kind === 'text' ? embed.colour : undefined);
</script>

{#if embed.kind === 'image'}
  {@const size = fit(embed.width, embed.height, 400, 300)}
  <button class="media" style:width="{size.width}px" style:aspect-ratio="{size.width} / {size.height}" aria-label={m.conversation.viewImage('')}
    onclick={() => viewer.open({ src: proxied(embed.url), alt: '', width: embed.width, height: embed.height, original: embed.url })}>
    <img src={proxied(embed.url)} alt="" loading="lazy" decoding="async" />
  </button>
{:else if embed.kind === 'video'}
  {@const size = fit(embed.width, embed.height, 400, 300)}
  <!-- svelte-ignore a11y_media_has_caption -->
  <video class="media" controls preload="metadata" src={proxied(embed.url)} width={size.width} style:aspect-ratio="{size.width} / {size.height}"></video>
{:else}
  <article class="card" style:--embed={colour}>
    <div class="text">
      {#if embed.kind === 'website' && embed.siteName}<p class="site">{embed.siteName}</p>{/if}
      {#if embed.title}
        {#if embed.url}<a class="title" href={embed.url} target="_blank" rel="noopener noreferrer">{embed.title}</a>{:else}<p class="title">{embed.title}</p>{/if}
      {/if}
      {#if embed.description}
        <div class="description">{#if embed.kind === 'text'}<Markdown source={embed.description} />{:else}{embed.description}{/if}</div>
      {/if}
    </div>
    {#if embed.kind === 'website' && embed.image}
      {@const img = embed.image}
      {@const large = img.size === 'large' || !!embed.special}
      {@const size = large ? fit(img.width, img.height, 400, 300) : fit(img.width, img.height, 80, 80)}
      {#if embed.special?.type === 'youtube' && embed.url}
        <a class="media large video-link" href={embed.url} target="_blank" rel="noopener noreferrer" style:width="{size.width}px" style:aspect-ratio="{size.width} / {size.height}" aria-label={m.conversation.playVideo}>
          <img src={proxied(img.url)} alt="" loading="lazy" />
          <span class="play" aria-hidden="true"><Play size={28} /></span>
        </a>
      {:else}
        <button class="media" class:large class:thumb={!large} style:width="{size.width}px" style:aspect-ratio="{size.width} / {size.height}" aria-label={m.conversation.viewImage(embed.title ?? '')}
          onclick={() => viewer.open({ src: proxied(img.url), alt: embed.title ?? '', width: img.width, height: img.height, original: img.url })}>
          <img src={proxied(img.url)} alt="" loading="lazy" decoding="async" />
        </button>
      {/if}
    {:else if embed.kind === 'text' && embed.media}
      <img class="media large" src={fileUrl(embed.media, { maxSide: 800 })} alt="" loading="lazy" />
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
</style>
