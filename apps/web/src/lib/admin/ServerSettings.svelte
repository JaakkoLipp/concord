<script lang="ts">
  /**
   * Server settings at /app/server-settings/<server>/<section> (m2c-plan.md, "Server settings, screen by
   * screen"): only the sections this account may use, and Delete server for the owner. The shell under the
   * settings modal hosts the member dialogs.
   */
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { Button } from '@concord/ui';
  import type { Session } from '@concord/domain';
  import { m } from '$lib/i18n/index.ts';
  import { isOwner, serverPerms, serverSections, type ServerSection } from '$lib/view/admin.ts';
  import { Permission, has } from '@concord/domain';
  import { app } from '$lib/session/app.svelte.ts';
  import ServerTag from './ServerTag.svelte';
  type Section = ServerSection | 'tag';
  import SettingsFrame from '$lib/settings/SettingsFrame.svelte';
  import Overview from './Overview.svelte';
  import Roles from './Roles.svelte';
  import Invites from './Invites.svelte';
  import Emoji from './Emoji.svelte';
  import Members from './Members.svelte';
  import Bans from './Bans.svelte';
  import DeleteServerDialog from './DeleteServerDialog.svelte';

  let { session, server, section }: { session: Session; server: string; section: string } = $props();
  const store = $derived(session.store);
  const info = $derived(store.servers.get(server));
  // The server tag is ours, not Stoat's (m4.5-plan.md task 10): for server creators who can manage the server.
  const tagAllowed = $derived(!!app.layerMe?.gates.serverCreator && has(serverPerms(store, server), Permission.ManageServer));
  const sections = $derived<Section[]>([...serverSections(store, server), ...(tagAllowed ? ['tag' as const] : [])]);
  const current = $derived(sections.find((s) => s === section) ?? sections[0]);
  const items = $derived(sections.map((s) => ({ id: s, label: m.admin.sections[s], target: { kind: 'server' as const, server, section: s } })));
  let deleting = $state(false);

  // Gone, or nothing here for this account: back to the app. Waits for the connection, so a reload can load it first.
  $effect(() => {
    if (store.connection !== 'ready') return;
    if (!info || (!sections.length && !isOwner(store, server))) void goto(resolve('/app/channels/@me'), { replaceState: true });
  });
</script>

{#if info}
  <SettingsFrame title={info.name} {items} active={current ?? ''} heading={current ? m.admin.sections[current] : ''}>
    {#if current === 'overview'}<Overview {session} {server} />{/if}
    {#if current === 'roles'}<Roles {session} {server} />{/if}
    {#if current === 'emoji'}<Emoji {session} {server} />{/if}
    {#if current === 'invites'}<Invites {session} {server} />{/if}
    {#if current === 'members'}<Members {session} {server} />{/if}
    {#if current === 'bans'}<Bans {session} {server} />{/if}
    {#if current === 'tag'}<ServerTag {session} {server} />{/if}
    {#snippet footer()}
      {#if isOwner(store, server)}
        <Button variant="ghost" size="sm" onclick={() => (deleting = true)}>{m.admin.deleteServer}</Button>
      {/if}
    {/snippet}
  </SettingsFrame>
  <DeleteServerDialog {session} {server} open={deleting} onclose={() => (deleting = false)} />
{/if}
