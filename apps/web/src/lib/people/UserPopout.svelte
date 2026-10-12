<script lang="ts">
  import { Popover } from '@concord/ui';
  import type { Session } from '@concord/domain';
  import { m } from '$lib/i18n/index.ts';
  import { popout } from '$lib/view/popout.svelte.ts';
  import ProfileCard from './ProfileCard.svelte';

  let { session }: { session: Session } = $props();
  $effect(() => {
    if (popout.user) void session.loadProfile(popout.user);
  });
</script>

<Popover anchor={popout.anchor} open={!!popout.user} onclose={() => popout.close()} side={popout.side} label={m.people.profile}>
  {#if popout.user}
    <ProfileCard store={session.store} user={popout.user} server={popout.server} variant="popout" />
  {/if}
</Popover>
