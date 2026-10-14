<script lang="ts">
  import { untrack } from 'svelte';
  import { Popover } from '@concord/ui';
  import type { Session } from '@concord/domain';
  import { m } from '$lib/i18n/index.ts';
  import { popout } from '$lib/view/popout.svelte.ts';
  import ProfileCard from './ProfileCard.svelte';

  let { session }: { session: Session } = $props();
  $effect(() => {
    // Shows what is cached at once and fetches it fresh, in case a change arrived where no event reaches.
    // untrack: loadProfile reads the profile map, and this must not run again when the fetch fills it.
    const user = popout.user;
    if (!user) return;
    untrack(() => void session.loadProfile(user, true));
    return session.watchProfile(user);
  });
</script>

<Popover anchor={popout.anchor} open={!!popout.user} onclose={() => popout.close()} side={popout.side} label={m.people.profile}>
  {#if popout.user}
    <ProfileCard store={session.store} {session} user={popout.user} server={popout.server} variant="popout" />
  {/if}
</Popover>
