<script lang="ts">
  /**
   * The ringing card for a DM or group call (client.md section 10.8): the caller, where, Join and Ignore. It
   * doesn't take focus, so typing carries on; Escape inside it ignores the call.
   */
  import { Avatar, Button } from '@concord/ui';
  import type { Ring, Store } from '@concord/domain';
  import Phone from '@lucide/svelte/icons/phone';
  import PhoneOff from '@lucide/svelte/icons/phone-off';
  import { m } from '$lib/i18n/index.ts';
  import { channelName } from '$lib/view/channels.ts';
  import { avatarUrl } from '$lib/view/users.ts';
  import type { Rings } from '$lib/voice/rings.svelte.ts';

  let { store, rings }: { store: Store; rings: Rings } = $props();

  const caller = (r: Ring) => store.displayName(r.initiator) || m.markdown.unknownUser;
  const place = (r: Ring) => {
    const c = store.channels.get(r.channel);
    return c?.kind === 'group' ? channelName(store, c) : m.voice.ring.direct;
  };
</script>

<div class="rings" aria-live="assertive">
  {#each rings.shown as r (r.channel)}
    <!-- Escape reaches the card only from its own buttons, which are the interactive part. -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <section class="card" aria-label={m.voice.ring.label(caller(r))} onkeydown={(e) => { if (e.key === 'Escape') rings.ignore(r); }}>
      <span class="avatar"><Avatar src={avatarUrl(store.users.get(r.initiator) ?? { id: r.initiator })} size={40} /></span>
      <div class="text">
        <p class="who">{caller(r)}</p>
        <p class="where">{place(r)}</p>
      </div>
      <div class="actions">
        <Button size="sm" onclick={() => rings.join(r)}><Phone size={16} />{m.voice.ring.join}</Button>
        <Button size="sm" variant="danger" onclick={() => rings.ignore(r)}><PhoneOff size={16} />{m.voice.ring.ignore}</Button>
      </div>
    </section>
  {/each}
</div>

<style>
  .rings {
    position: fixed; top: calc(var(--header-h) + var(--space-4)); right: var(--space-5); z-index: 800;
    display: grid; gap: var(--space-3); width: min(22rem, calc(100vw - 2 * var(--space-5)));
  }
  .card {
    display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: var(--space-3) var(--space-4);
    padding: var(--space-4); border: 1px solid var(--border-default); border-radius: var(--radius-lg);
    background: var(--surface-4); box-shadow: var(--shadow-popover); animation: rise var(--dur-popover) var(--ease-out);
  }
  /* A slow pulse while it rings, as the tone does. */
  .avatar { position: relative; display: grid; border-radius: 50%; }
  .avatar::after {
    content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
    box-shadow: 0 0 0 2px var(--status-online); animation: pulse calc(var(--dur-loop) * 2) var(--ease-in-out) infinite;
  }
  .text { min-width: 0; }
  .who, .where { margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .who { color: var(--text-strong); font: 600 var(--text-md) var(--font-sans); }
  .where { color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  .actions { grid-column: 1 / -1; display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); }
  @keyframes rise { from { opacity: 0; translate: 0 calc(-1 * var(--space-2) * var(--motion)); } }
  @keyframes pulse { 0%, 100% { opacity: 1; scale: 1; } 50% { opacity: 0; scale: 1.15; } }
  /* A loop: reduced motion stops it, leaving the ring still. */
  @media (prefers-reduced-motion: reduce) { .avatar::after { animation: none; } }
</style>
