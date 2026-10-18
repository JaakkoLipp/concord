<script lang="ts">
  /**
   * Channel settings at /app/channel-settings/<channel>/<section> (m2c-plan.md): Overview, Permissions, and
   * Delete channel, each for those who may.
   */
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { Button } from '@concord/ui';
  import { Permission, has, type Session } from '@concord/domain';
  import { m } from '$lib/i18n/index.ts';
  import { firstChannel, permissionsIn } from '$lib/view/channels.ts';
  import { untrack } from 'svelte';
  import { isServerAdmin } from '$lib/view/admin.ts';
  import { deleteChannel } from './menu.ts';
  import SettingsFrame from '$lib/settings/SettingsFrame.svelte';
  import ChannelOverview from './ChannelOverview.svelte';
  import ChannelPermissions from './ChannelPermissions.svelte';

  type Section = 'overview' | 'permissions';
  let { session, channel, section }: { session: Session; channel: string; section: string } = $props();
  const store = $derived(session.store);
  const info = $derived(store.channels.get(channel));
  const mine = $derived(info ? permissionsIn(store, info) : 0n);
  const NEEDS: Record<Section, bigint> = { overview: Permission.ManageChannel, permissions: Permission.ManagePermissions };
  const sections = $derived((['overview', 'permissions'] as Section[]).filter((s) => has(mine, NEEDS[s])));
  const current = $derived(sections.find((s) => s === section) ?? sections[0]);
  const items = $derived(sections.map((s) => ({ id: s, label: m.admin.channelSections[s], target: { kind: 'channel' as const, channel, section: s } })));
  const name = $derived(info?.kind === 'text' ? info.name : '');

  // Gone, or nothing here for this account: back to its server's first channel, else the app, once connected
  // so a reload can load it first.
  let server = $state<string | null>(null);
  $effect(() => { if (info?.kind === 'text') server = info.server; });
  $effect(() => {
    if (store.connection !== 'ready') return;
    if (info?.kind === 'text' && sections.length) return;
    const first = server && store.servers.has(server) ? untrack(() => firstChannel(store, server!)) : undefined;
    void goto(server && first ? resolve('/(app)/app/channels/[server]/[channel]/[[message]]', { server, channel: first }) : resolve('/app/channels/@me'), { replaceState: true });
  });

  const remove = () => void deleteChannel(session, channel);
</script>

{#if info?.kind === 'text'}
  <SettingsFrame title={name} {items} active={current ?? ''} heading={current ? m.admin.channelSections[current] : ''}>
    {#if current === 'overview'}<ChannelOverview {session} {channel} />{/if}
    {#if current === 'permissions'}<ChannelPermissions {session} {channel} />{/if}
    {#snippet footer()}
      {#if has(mine, Permission.ManageChannel) && info?.kind === 'text' && isServerAdmin(store, info.server)}<Button variant="ghost" size="sm" onclick={remove}>{m.admin.deleteChannel}</Button>{/if}
    {/snippet}
  </SettingsFrame>
{/if}
