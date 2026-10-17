<script lang="ts">
  /** Ask for a beta invitation, from the DM sidebar under Mentions: everyone, with approval for members. */
  import Invitations from '$lib/beta/Invitations.svelte';
  import { app } from '$lib/session/app.svelte.ts';
</script>

{#if app.session}<Invitations mode="invite" />{/if}
