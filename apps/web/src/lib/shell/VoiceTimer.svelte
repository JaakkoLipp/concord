<script lang="ts">
  /** How long a voice channel has been occupied. It ticks only while shown, so only occupied channels keep a timer. */
  import { elapsed } from './voice.ts';

  let { since }: { since: number } = $props();
  let now = $state(Date.now());
  $effect(() => {
    const timer = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(timer);
  });
</script>

<span class="timer" aria-hidden="true">{elapsed(now - since)}</span>

<style>
  .timer { flex: none; color: var(--status-online); font: 500 var(--text-xs) var(--font-sans); font-variant-numeric: tabular-nums; }
</style>
