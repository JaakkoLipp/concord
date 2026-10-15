<script lang="ts">
  import type { FileRef } from '@concord/domain';
  import { fileUrl } from '@concord/stoat';
  import FileIcon from '@lucide/svelte/icons/file';
  import { m } from '$lib/i18n/index.ts';
  import { fileSize, fit, placeholder } from '$lib/view/media.ts';
  import { viewer } from '$lib/view/viewer.svelte.ts';

  let { file }: { file: FileRef } = $props();
  const url = $derived(fileUrl(file));
  const size = $derived(fit(file.width ?? 0, file.height ?? 0, 400, 300));
  const thumb = $derived(placeholder(file.thumbhash));
</script>

{#if file.kind === 'image'}
  <button class="media" style:width="{size.width}px" style:aspect-ratio="{size.width} / {size.height}" style:background-image={thumb ? `url(${thumb})` : undefined}
    aria-label={m.conversation.viewImage(file.filename)}
    onclick={() => viewer.open({ src: url, alt: file.filename, width: file.width, height: file.height, original: url })}>
    <img src={fileUrl(file, { maxSide: 800 })} data-original={fileUrl(file)} data-name={file.filename} alt={file.filename} width={size.width} height={size.height} loading="lazy" decoding="async" />
  </button>
{:else if file.kind === 'video'}
  <!-- svelte-ignore a11y_media_has_caption -->
  <video class="media" controls preload="metadata" src={url} width={size.width} style:aspect-ratio="{size.width} / {size.height}"></video>
{:else}
  <div class="file">
    <FileIcon size={28} aria-hidden="true" />
    <div class="meta">
      <a href={url} target="_blank" rel="noopener noreferrer" download={file.filename}>{file.filename}</a>
      <span>{fileSize(file.size)}</span>
    </div>
    {#if file.kind === 'audio'}<audio controls preload="none" src={url}></audio>{/if}
  </div>
{/if}

<style>
  .media {
    display: block; max-width: 100%; height: auto; padding: 0; margin: var(--space-2) 0 0;
    border: 0; border-radius: var(--radius-md); overflow: hidden; background: var(--surface-2) center / cover no-repeat;
    cursor: zoom-in;
  }
  video.media { cursor: auto; background: #000; }
  .media img { width: 100%; height: 100%; object-fit: cover; }
  .file {
    display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-4); max-width: 26rem; margin-top: var(--space-2);
    padding: var(--space-4); border: 1px solid var(--border-default); border-radius: var(--radius-md); background: var(--surface-1); color: var(--text-secondary);
  }
  .meta { display: grid; min-width: 0; flex: 1; }
  .meta a { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 500 var(--text-md) var(--font-sans); }
  .meta span { font: var(--text-xs) var(--font-sans); }
  audio { width: 100%; }
</style>
