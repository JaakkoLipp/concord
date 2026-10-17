<script lang="ts">
  /** /app reopens the last visited channel (client.md section 5). */
  import { goto } from '$app/navigation';
  import { lastPlace } from '$lib/view/places.ts';

  $effect(() => {
    // eslint-disable-next-line svelte/no-navigation-without-resolve -- lastPlace() resolves
    void goto(lastPlace(), { replaceState: true });
  });
</script>
