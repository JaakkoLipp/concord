<script lang="ts">
  /** Open the app on the Friends / direct messages home screen. */
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';

  $effect(() => {
    void goto(resolve('/app/channels/@me'), { replaceState: true });
  });
</script>
