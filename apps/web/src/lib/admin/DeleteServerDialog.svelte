<script lang="ts">
  /** Delete server, for the owner: typing the server's name confirms. */
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { Button, Dialog, TextField } from '@concord/ui';
  import type { Session } from '@concord/domain';
  import { m } from '$lib/i18n/index.ts';
  import { toasts } from '$lib/view/toast.svelte.ts';

  let { session, server, open, onclose }: { session: Session; server: string; open: boolean; onclose: () => void } = $props();
  const name = $derived(session.store.servers.get(server)?.name ?? '');
  let typed = $state('');
  let busy = $state(false);

  function close() {
    typed = '';
    onclose();
  }
  async function remove() {
    busy = true;
    try {
      await session.admin.deleteServer(server);
      close();
      await goto(resolve('/app/channels/@me'), { replaceState: true });
    } catch {
      toasts.show(m.admin.deleteFailed);
    } finally {
      busy = false;
    }
  }
</script>

<Dialog {open} title={m.admin.deleteTitle(name)} onclose={close}>
  <p>{m.admin.deleteBody}</p>
  <TextField label={m.admin.deleteType} bind:value={typed} autocomplete="off" />
  {#snippet actions()}
    <Button variant="ghost" onclick={close}>{m.admin.cancel}</Button>
    <Button variant="danger" {busy} disabled={typed.trim() !== name} onclick={remove}>{m.admin.deleteConfirm}</Button>
  {/snippet}
</Dialog>
