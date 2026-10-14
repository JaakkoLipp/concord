<script lang="ts">
  import { untrack } from 'svelte';
  import type { Session } from '@concord/domain';
  import { m } from '$lib/i18n/index.ts';
  import { dmPartner } from '$lib/view/channels.ts';
  import ProfileCard from './ProfileCard.svelte';

  let { session, channel }: { session: Session; channel: string } = $props();
  const info = $derived(session.store.channels.get(channel));
  const partner = $derived(info ? dmPartner(session.store, info) : undefined);
  $effect(() => {
    // untrack: loadProfile reads the store, and filling it must not run this again.
    const p = partner;
    if (!p) return;
    untrack(() => void session.loadProfile(p));
    return session.watchProfile(p);
  });
</script>

{#if partner}
  <aside class="panel" aria-label={m.people.profile}>
    <ProfileCard store={session.store} {session} user={partner} server={undefined} variant="panel" inDm />
  </aside>
{/if}

<style>
  .panel { height: 100%; }
</style>
