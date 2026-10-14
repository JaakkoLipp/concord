<script lang="ts">
  /**
   * Server settings at /app/server-settings/<server>/<section> (m2c-plan.md, "Server settings, screen by
   * screen"): only the sections this account may use, and Delete server for the owner.
   */
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { Button } from '@concord/ui';
  import type { Session } from '@concord/domain';
  import { m } from '$lib/i18n/index.ts';
  import { isOwner, serverSections, type ServerSection } from '$lib/view/admin.ts';
  import SettingsFrame from '$lib/settings/SettingsFrame.svelte';
  import Overview from './Overview.svelte';
  import Roles from './Roles.svelte';
  import DeleteServerDialog from './DeleteServerDialog.svelte';

  let { session, server, section }: { session: Session; server: string; section: string } = $props();
  const store = $derived(session.store);
  const info = $derived(store.servers.get(server));
  const sections = $derived(serverSections(store, server));
  const current = $derived(sections.find((s) => s === section) ?? sections[0]);
  const items = $derived(sections.map((s) => ({ id: s, label: m.admin.sections[s], href: resolve('/(app)/app/server-settings/[server]/[section]', { server, section: s }) })));
  let deleting = $state(false);

  // Gone, or nothing here for this account: back to the app. Waits for the connection, so a reload can load it first.
  $effect(() => {
    if (store.connection !== 'ready') return;
    if (!info || (!sections.length && !isOwner(store, server))) void goto(resolve('/app/channels/@me'), { replaceState: true });
  });
</script>

{#if info}
  <SettingsFrame title={info.name} {items} active={current ?? ''} heading={current ? m.admin.sections[current as ServerSection] : ''}>
    {#if current === 'overview'}<Overview {session} {server} />{/if}
    {#if current === 'roles'}<Roles {session} {server} />{/if}
    {#snippet footer()}
      {#if isOwner(store, server)}
        <Button variant="ghost" size="sm" onclick={() => (deleting = true)}>{m.admin.deleteServer}</Button>
      {/if}
    {/snippet}
  </SettingsFrame>
  <DeleteServerDialog {session} {server} open={deleting} onclose={() => (deleting = false)} />
{/if}
