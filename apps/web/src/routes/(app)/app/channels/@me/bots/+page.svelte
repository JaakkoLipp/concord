<script lang="ts">
  /** Bots, from the DM sidebar: your own, and adding a bot to a server or group. */
  import Bots from '$lib/bots/Bots.svelte';
  import { app } from '$lib/session/app.svelte.ts';
</script>

{#if app.session}<Bots session={app.session} />{/if}
