<script lang="ts">
  /** "Create a server" (m2c-plan.md task 2): a name and an optional icon, then the bootstrap, then the server. */
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { Button, Dialog, TextField } from '@concord/ui';
  import type { Session } from '@concord/domain';
  import { m } from '$lib/i18n/index.ts';
  import { firstChannel } from '$lib/view/channels.ts';
  import { toasts } from '$lib/view/toast.svelte.ts';
  import ImagePick, { type ImageChoice } from './ImagePick.svelte';

  let { session, open, onclose }: { session: Session; open: boolean; onclose: () => void } = $props();
  let name = $state('');
  let icon = $state<ImageChoice>(null);
  let busy = $state(false);
  const length = $derived([...name.trim()].length);
  const error = $derived(name && (length < 1 || length > 32) ? m.admin.nameError : undefined);

  function close() {
    name = '';
    icon = null;
    onclose();
  }

  async function create(e: SubmitEvent) {
    e.preventDefault();
    if (busy || !length || error) return;
    busy = true;
    try {
      const { id, setUp } = await session.admin.createServer(name.trim(), icon && icon !== 'remove' ? icon.file : undefined);
      close();
      if (!setUp) toasts.show(m.admin.setupUnfinished);
      const channel = firstChannel(session.store, id);
      await goto(channel ? resolve('/(app)/app/channels/[server]/[channel]/[[message]]', { server: id, channel }) : resolve('/app/channels/@me'));
    } catch {
      toasts.show(m.admin.createFailed);
    } finally {
      busy = false;
    }
  }
</script>

<Dialog {open} title={m.admin.createTitle} onclose={close}>
  <form id="create-server" class="form" onsubmit={create}>
    <p>{m.admin.createBody}</p>
    <TextField label={m.admin.serverName} bind:value={name} {error} maxlength={64} required />
    <ImagePick label={m.admin.icon} bind:value={icon} limit={session.store.node?.uploadLimits.icons ?? 2_500_000} />
  </form>
  {#snippet actions()}
    <Button variant="ghost" onclick={close}>{m.admin.cancel}</Button>
    <Button type="submit" form="create-server" {busy} disabled={!length || !!error}>{m.admin.create}</Button>
  {/snippet}
</Dialog>

<style>
  .form { display: grid; gap: var(--space-5); }
  .form p { margin: 0; color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
</style>
