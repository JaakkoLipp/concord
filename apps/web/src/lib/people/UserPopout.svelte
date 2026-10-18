<script lang="ts">
  import { untrack } from 'svelte';
  import { Popover } from '@concord/ui';
  import type { Session } from '@concord/domain';
  import { m } from '$lib/i18n/index.ts';
  import { PROFILE_TRIGGER, popout } from '$lib/view/popout.svelte.ts';
  import ProfileCard from './ProfileCard.svelte';

  let { session }: { session: Session } = $props();
  /** The member list a row belongs to, whose edge the popout keeps its gap from. */
  const edge = $derived(popout.side === 'left' ? popout.anchor?.closest<HTMLElement>('aside') ?? null : null);
  $effect(() => {
    // Shows what is cached at once and fetches it fresh, in case a change arrived where no event reaches.
    // untrack: loadProfile reads the profile map, and this must not run again when the fetch fills it.
    const user = popout.user;
    if (!user) return;
    untrack(() => void session.loadProfile(user, true));
    return session.watchProfile(user);
  });
</script>

<!-- Opens and re-anchors at full opacity in the click's frame, 12 px left of the member list when opened from
     it (m4.6-plan.md task 14). -->
<Popover anchor={popout.anchor} open={!!popout.user} onclose={() => popout.close()} side={popout.side} label={m.people.profile}
  instant keep={PROFILE_TRIGGER} edge={edge} gap={edge ? 12 : 8}>
  {#if popout.user}
    <ProfileCard store={session.store} {session} user={popout.user} server={popout.server} variant="popout" />
  {/if}
</Popover>
