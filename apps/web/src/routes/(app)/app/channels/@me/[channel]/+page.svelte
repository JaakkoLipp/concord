<script lang="ts">
  import { page } from '$app/state';
  import Conversation from '$lib/conversation/Conversation.svelte';

  const channel = $derived(page.params.channel!);
</script>

<Conversation {channel} />
