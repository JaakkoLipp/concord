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
  import { permissionsIn } from '$lib/view/channels.ts';
  import { confirm } from '$lib/view/confirm.svelte.ts';
  import { toasts } from '$lib/view/toast.svelte.ts';
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
  const items = $derived(sections.map((s) => ({ id: s, label: m.admin.channelSections[s], href: resolve('/(app)/app/channel-settings/[channel]/[section]', { channel, section: s }) })));
  const name = $derived(info?.kind === 'text' ? info.name : '');

  // Gone, or nothing here for this account: back to the app, once connected so a reload can load it first.
  $effect(() => {
    if (store.connection !== 'ready') return;
    if (info?.kind !== 'text' || !sections.length) void goto(resolve('/app/channels/@me'), { replaceState: true });
  });

  async function remove() {
    if (info?.kind !== 'text') return;
    const ok = await confirm.ask({ title: m.admin.deleteChannelTitle(name), body: m.admin.deleteChannelBody, confirm: m.admin.deleteChannel, danger: true });
    if (!ok) return;
    try {
      await session.admin.deleteChannel(channel);
    } catch {
      toasts.show(m.admin.channelFailed);
    }
  }
</script>

{#if info?.kind === 'text'}
  <SettingsFrame title={name} {items} active={current ?? ''} heading={current ? m.admin.channelSections[current] : ''}>
    {#if current === 'overview'}<ChannelOverview {session} {channel} />{/if}
    {#if current === 'permissions'}<ChannelPermissions {session} {channel} />{/if}
    {#snippet footer()}
      {#if has(mine, Permission.ManageChannel)}<Button variant="ghost" size="sm" onclick={remove}>{m.admin.deleteChannel}</Button>{/if}
    {/snippet}
  </SettingsFrame>
{/if}
