<script lang="ts">
  /**
   * A small clock beside a timed-out member's name, with the end as its tooltip (m4.7-plan.md task 6). It goes by itself
   * when the timeout ends. Screen readers get the end from its name.
   */
  import { memberKey, type Id, type Store } from '@concord/domain';
  import { tooltip } from '@concord/ui';
  import Clock from '@lucide/svelte/icons/clock';
  import { m } from '$lib/i18n/index.ts';
  import { fullDate } from '$lib/markdown/time.ts';
  import { permissionTime } from '$lib/view/clock.svelte.ts';

  let { store, server, user }: { store: Store; server: Id | undefined; user: Id } = $props();
  const until = $derived(server ? store.members.get(memberKey(server, user))?.timeout : undefined);
  const end = $derived(until && Date.parse(until) > permissionTime(until).getTime() ? new Date(until) : null);
  const label = $derived(end ? m.moderation.timedOutUntil(fullDate(end)) : '');
</script>

{#if end}
  <span class="mark" role="img" aria-label={label} use:tooltip={label}><Clock size={14} /></span>
{/if}

<style>
  .mark { display: inline-grid; place-items: center; flex: none; color: var(--text-secondary); }
</style>
