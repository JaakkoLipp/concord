<script lang="ts">
  import Friends from '$lib/people/Friends.svelte';
  import { app } from '$lib/session/app.svelte.ts';
</script>

{#if app.session}<Friends session={app.session} />{/if}
