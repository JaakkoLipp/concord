<script lang="ts">
  /** The admins' view, from the DM sidebar under Mentions: people, roles, and the requests waiting for review. */
  import Administration from '$lib/beta/Administration.svelte';
  import { app } from '$lib/session/app.svelte.ts';
</script>

{#if app.session}<Administration />{/if}
