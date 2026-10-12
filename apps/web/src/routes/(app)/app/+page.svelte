<script lang="ts">
  /** /app reopens the last visited channel (client.md section 5). */
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { recalled } from '$lib/view/channels.ts';

  $effect(() => {
    const last = recalled('last');
    const [server, channel] = last?.split('/') ?? [];
    if (server && channel && server !== '@me') void goto(resolve('/(app)/app/channels/[server]/[channel]/[[message]]', { server, channel }), { replaceState: true });
    else if (channel) void goto(resolve('/(app)/app/channels/@me/[channel]', { channel }), { replaceState: true });
    else void goto(resolve('/app/channels/@me'), { replaceState: true });
  });
</script>
