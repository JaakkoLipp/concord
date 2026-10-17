<script lang="ts">
  import Presence from './Presence.svelte';
  import { fadeIn } from './motion.ts';
  import type { PresenceState } from './types.ts';

  interface Props {
    src: string;
    /** Size in CSS pixels; one of the avatar tokens. */
    size?: number;
    presence?: PresenceState | undefined;
    presenceLabel?: string | undefined;
  }
  let { src, size = 32, presence, presenceLabel }: Props = $props();
  const dot = $derived(Math.round(size * 0.3));
  const ring = $derived(Math.max(2, Math.round(size * 0.075)));
  let failed = $state(false);
</script>

<span class="avatar" style:--size="{size}px" style:--dot="{dot}px" style:--ring="{ring}px" class:with-presence={!!presence}>
  {#if !failed}
    <img use:fadeIn={src} {src} alt="" width={size} height={size} loading="lazy" decoding="async" draggable="false" onerror={() => (failed = true)} />
  {:else}
    <span class="fallback"></span>
  {/if}
  {#if presence}
    <span class="dot"><Presence state={presence} size={dot} label={presenceLabel} /></span>
  {/if}
</span>

<style>
  .avatar { position: relative; display: inline-block; flex: none; width: var(--size); height: var(--size); }
  /* A black circle until the image fades in over it (motion spec 4.8). */
  .avatar::before { content: ''; position: absolute; inset: 0; border-radius: 50%; background: var(--surface-0); }
  img, .fallback { position: relative; width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
  .fallback { background: var(--surface-4); }
  /* Cut the avatar where the presence dot sits, so the dot reads on any surface. */
  .with-presence img, .with-presence .fallback, .with-presence::before {
    mask: radial-gradient(circle at calc(100% - var(--dot) / 2) calc(100% - var(--dot) / 2), transparent calc(var(--dot) / 2 + var(--ring)), #000 calc(var(--dot) / 2 + var(--ring) + 0.5px));
  }
  .dot { position: absolute; right: 0; bottom: 0; display: block; line-height: 0; }
</style>
