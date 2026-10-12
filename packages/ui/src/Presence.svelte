<script lang="ts">
  /** Presence by shape as well as colour (client.md section 9). */
  import type { PresenceState } from './types.ts';
  interface Props { state: PresenceState; size?: number; label?: string | undefined }
  let { state, size = 10, label }: Props = $props();
  const uid = $props.id();
</script>

<svg class="presence {state}" width={size} height={size} viewBox="0 0 10 10" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : 'true'}>
  {#if state === 'online'}
    <circle cx="5" cy="5" r="5" />
  {:else if state === 'idle'}
    <mask id="{uid}-idle"><rect width="10" height="10" fill="white" /><circle cx="2.5" cy="2.5" r="3.75" fill="black" /></mask>
    <circle cx="5" cy="5" r="5" mask="url(#{uid}-idle)" />
  {:else if state === 'busy'}
    <mask id="{uid}-busy"><rect width="10" height="10" fill="white" /><rect x="2" y="3.75" width="6" height="2.5" rx="1.25" fill="black" /></mask>
    <circle cx="5" cy="5" r="5" mask="url(#{uid}-busy)" />
  {:else if state === 'focus'}
    <mask id="{uid}-focus"><rect width="10" height="10" fill="white" /><circle cx="5" cy="5" r="3" fill="black" /></mask>
    <circle cx="5" cy="5" r="5" mask="url(#{uid}-focus)" />
    <circle cx="5" cy="5" r="1.5" />
  {:else}
    <mask id="{uid}-offline"><rect width="10" height="10" fill="white" /><circle cx="5" cy="5" r="2.5" fill="black" /></mask>
    <circle cx="5" cy="5" r="5" mask="url(#{uid}-offline)" />
  {/if}
</svg>

<style>
  .presence { display: block; flex: none; }
  .online { fill: var(--status-online); }
  .idle { fill: var(--status-idle); }
  .busy { fill: var(--status-busy); }
  .focus { fill: var(--status-focus); }
  .offline { fill: var(--status-offline); }
</style>
