<script lang="ts">
  /** The admins' view, from the DM sidebar under Mentions: beta invitation requests to approve or decline. */
  import Invitations from '$lib/beta/Invitations.svelte';
  import { app } from '$lib/session/app.svelte.ts';
</script>

{#if app.session}<Invitations mode="review" />{/if}
