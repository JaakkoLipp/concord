<script lang="ts">
  import { page } from '$app/state';
  import { app } from '$lib/session/app.svelte.ts';
  import ServerSettings from '$lib/admin/ServerSettings.svelte';

  const server = $derived(page.params.server!);
  const section = $derived(page.params.section!);
</script>

{#if app.session}<ServerSettings session={app.session} {server} {section} />{/if}
