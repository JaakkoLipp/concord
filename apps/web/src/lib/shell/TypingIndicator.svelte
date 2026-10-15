<script lang="ts">
  /** Who else is typing in the channel (m2a-plan.md task 7). Entries expire on their own if a stop is lost. */
  import type { Store } from '@concord/domain';
  import { m } from '$lib/i18n/index.ts';

  let { store, channel, server }: { store: Store; channel: string; server: string | undefined } = $props();
  let now = $state(Date.now());
  const raw = $derived(store.typing.get(channel) ?? {});
  const names = $derived(Object.entries(raw).filter(([, until]) => until > now).map(([user]) => store.displayName(user, server)));
  $effect(() => {
    if (!Object.keys(raw).length) return;
    now = Date.now();
    const t = setInterval(() => (now = Date.now()), 1_000);
    return () => clearInterval(t);
  });
  const text = $derived(
    names.length === 0 ? '' : names.length === 1 ? m.typing.one(names[0]!) : names.length === 2 ? m.typing.two(names[0]!, names[1]!)
      : names.length === 3 ? m.typing.three(names[0]!, names[1]!, names[2]!) : m.typing.several,
  );
</script>

<div class="typing" class:active={!!text} aria-live="polite">
  {#if text}<span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>{text}{/if}
</div>

<style>
  .typing {
    /* A strip just above the input box, over the messages' bottom padding, as on Discord. It starts where the
       composer's text does: the composer's margin, border and padding, the attach button and the gap after it. */
    position: absolute; left: 0; right: 0; bottom: 100%; height: var(--space-7); pointer-events: none;
    padding: 0 var(--space-3) 0 calc(var(--space-3) * 3 + 1px + var(--space-8));
    display: flex; align-items: center; gap: var(--space-2); overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
    color: var(--text-secondary); font: 500 var(--text-xs) var(--font-sans);
  }
  .typing.active { background: var(--surface-0); }
  .dots { display: inline-flex; gap: 2px; }
  .dots i { width: 4px; height: 4px; border-radius: 50%; background: currentColor; animation: blink var(--dur-loop) infinite var(--ease-in-out); }
  .dots i:nth-child(2) { animation-delay: calc(var(--dur-loop) / 8); }
  .dots i:nth-child(3) { animation-delay: calc(var(--dur-loop) / 4); }
  @keyframes blink { 0%, 60%, 100% { opacity: 0.3; } 30% { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { .dots i { animation: none; } }
</style>
