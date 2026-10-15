<script lang="ts">
  /**
   * The stats overlay over a screen share (client.md section 10.3), read every second. A viewer sees what
   * arrives: resolution, frame rate counted from frames decoded, bitrate, codec, layer, loss, jitter and round
   * trip. The sharer sees what goes out: codec, encoder, what limits it, and each layer. The figures are also
   * data attributes, which the live checks read.
   */
  import { m } from '$lib/i18n/index.ts';
  import type { Feed } from '$lib/voice/call.ts';
  import type { SharerStats, ViewerStats } from '$lib/voice/videostats.ts';

  let { feed }: { feed: Feed } = $props();
  let viewer = $state<ViewerStats | null>(null);
  let sharer = $state<SharerStats | null>(null);
  const t = m.call.stat;

  $effect(() => {
    const f = feed;
    let live = true;
    const read = async () => {
      const s = await f.stats();
      if (!live) return;
      viewer = s?.viewer ?? null;
      sharer = s?.sharer ?? null;
    };
    void read();
    const timer = setInterval(() => void read(), 1000);
    return () => { live = false; clearInterval(timer); };
  });
</script>

{#snippet row(label: string, value: string)}
  <dt>{label}</dt><dd>{value}</dd>
{/snippet}

<div class="overlay" role="group" aria-label={m.call.stats}>
  {#if viewer}
    <dl data-role="viewer" data-width={viewer.width} data-height={viewer.height} data-fps={viewer.fps} data-codec={viewer.codec} data-layer={viewer.layer} data-kbps={viewer.kbps}>
      {@render row(t.resolution, m.call.size(viewer.width, viewer.height))}
      {@render row(t.fps, m.call.fpsValue(viewer.fps))}
      {@render row(t.bitrate, m.call.kbps(viewer.kbps))}
      {@render row(t.codec, viewer.decoder ? `${viewer.codec} (${viewer.decoder})` : viewer.codec)}
      {@render row(t.layer, m.call.layers[viewer.layer])}
      {@render row(t.loss, `${viewer.loss} %`)}
      {#if viewer.jitterMs !== undefined}{@render row(t.jitter, m.call.ms(viewer.jitterMs))}{/if}
      {#if viewer.rttMs !== undefined}{@render row(t.rtt, m.call.ms(viewer.rttMs))}{/if}
    </dl>
  {:else if sharer}
    <dl data-role="sharer" data-codec={sharer.codec} data-encoder={sharer.encoder ?? ''} data-limit={sharer.limitation} data-cpu={sharer.cpuLimited}>
      {@render row(t.codec, sharer.codec)}
      {#if sharer.encoder}{@render row(t.encoder, sharer.encoder)}{/if}
      {@render row(t.limit, m.call.limits[sharer.limitation] ?? sharer.limitation)}
      {@render row(t.cpu, sharer.cpuLimited ? m.call.yes : m.call.no)}
      {#each sharer.layers as l (l.rid)}
        {@render row(l.rid, `${m.call.size(l.width, l.height)}, ${m.call.fpsValue(l.fps)}, ${m.call.kbps(l.kbps)}`)}
      {/each}
    </dl>
  {/if}
</div>

<style>
  .overlay { position: absolute; top: var(--space-3); left: var(--space-3); z-index: 2; pointer-events: none; }
  dl {
    display: grid; grid-template-columns: auto auto; gap: 0 var(--space-3); margin: 0; padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md); background: var(--scrim); color: var(--text-strong); font: var(--text-xs) var(--font-sans); font-variant-numeric: tabular-nums;
  }
  dt { color: var(--text-secondary); }
  dd { margin: 0; }
</style>
