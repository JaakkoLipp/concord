<script lang="ts">
  /** Beta invitations for admins and moderators, from the DM sidebar under Mentions. */
  import Invitations from '$lib/beta/Invitations.svelte';
  import { app } from '$lib/session/app.svelte.ts';
</script>

{#if app.session}<Invitations />{/if}
