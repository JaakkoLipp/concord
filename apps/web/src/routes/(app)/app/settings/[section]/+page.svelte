<script lang="ts">
  import { page } from '$app/state';
  import { app } from '$lib/session/app.svelte.ts';
  import Settings from '$lib/settings/Settings.svelte';

  const section = $derived(page.params.section === 'notifications' || page.params.section === 'voice' ? page.params.section : 'profile');
</script>

{#if app.session}<Settings session={app.session} {section} />{/if}
