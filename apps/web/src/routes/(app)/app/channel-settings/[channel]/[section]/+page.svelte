<script lang="ts">
  import { page } from '$app/state';
  import { app } from '$lib/session/app.svelte.ts';
  import ChannelSettings from '$lib/admin/ChannelSettings.svelte';

  const channel = $derived(page.params.channel!);
  const section = $derived(page.params.section!);
</script>

{#if app.session}<ChannelSettings session={app.session} {channel} {section} />{/if}
