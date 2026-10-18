<script lang="ts">
  import { Avatar, Badge, fadeIn } from '@concord/ui';
  import { fileUrl } from '@concord/stoat';
  import type { Store } from '@concord/domain';
  import Users from '@lucide/svelte/icons/users';
  import AtSign from '@lucide/svelte/icons/at-sign';
  import Bot from '@lucide/svelte/icons/bot';
  import { shell } from '$lib/view/shell.svelte.ts';
  import Volume2 from '@lucide/svelte/icons/volume-2';
  import { resolve } from '$app/paths';
  import { m } from '$lib/i18n/index.ts';
  import { channelName, dmPartner } from '$lib/view/channels.ts';
  import { avatarUrl, presenceOf, statusTextOf } from '$lib/view/users.ts';
  import { menuOn } from '$lib/view/contextmenu.svelte.ts';
  import { app } from '$lib/session/app.svelte.ts';
  import { switcher } from '$lib/view/switcher.svelte.ts';
  import { notifyItems } from '$lib/notify/dialog.svelte.ts';
  import { participantMenu } from '$lib/call/menu.ts';
  import TagBadge from '$lib/people/TagBadge.svelte';
  import { closeDm, leaveGroup, room, startConversation } from '$lib/people/groups.ts';
  import FriendPicker from '$lib/people/FriendPicker.svelte';
  import { IconButton, type MenuItem } from '@concord/ui';
  import Plus from '@lucide/svelte/icons/plus';
  import X from '@lucide/svelte/icons/x';
  import MailPlus from '@lucide/svelte/icons/mail-plus';
  import Bug from '@lucide/svelte/icons/bug';
  import FeedbackDialog from '$lib/feedback/FeedbackDialog.svelte';
  import ShieldCheck from '@lucide/svelte/icons/shield-check';
  import { page } from '$app/state';

  interface Props { store: Store; active: string | null }
  let { store, active }: Props = $props();
  const dms = $derived(store.dmList());
  const incoming = $derived(store.related('Incoming').length);
  const gates = $derived(app.layerMe?.gates);
  const onInvitations = $derived(page.url.pathname === resolve('/app/channels/@me/invitations'));
  const onBots = $derived(page.url.pathname === resolve('/app/channels/@me/bots'));
  const onAdministration = $derived(page.url.pathname === resolve('/app/channels/@me/administration'));
  const onHome = $derived(active === null && !onInvitations && !onBots && !onAdministration);
  let picking = $state(false);
  let feedbackOpen = $state(false);

  function rowMenu(channel: string, partner: string | undefined): MenuItem[] {
    const session = app.session;
    if (!session) return [];
    const notify = notifyItems(session, 'channel', channel, 'conversation');
    if (partner) return [...participantMenu(session, app.voice, partner, { inDm: true }), 'separator', ...notify, 'separator', { label: m.groups.closeDm, onselect: () => closeDm(session, channel) }];
    return [...notify, 'separator', { label: m.groups.leave, danger: true, onselect: () => void leaveGroup(session, channel) }];
  }
</script>

<header class="search-header">
  <button class="search" onclick={() => switcher.show(false)}>{m.shell.findConversation}</button>
</header>
<nav class="dms" aria-label={m.shell.directMessages}>
  <a class="row friends" class:active={onHome} href={resolve('/app/channels/@me')} aria-current={onHome ? 'page' : undefined}>
    <span class="friends-icon" aria-hidden="true"><Users size={24} /></span>
    <span class="name">{m.shell.friends}</span>
    {#if incoming}<Badge count={incoming} label={m.friends.waiting(incoming)} />{/if}
  </a>
  <button class="row friends" class:active={shell.mentions} onclick={() => shell.openMentions()} aria-haspopup="dialog">
    <span class="friends-icon" aria-hidden="true"><AtSign size={24} /></span>
    <span class="name">{m.mentions.title}</span>
  </button>
  <a class="row friends" class:active={onBots} href={resolve('/app/channels/@me/bots')} aria-current={onBots ? 'page' : undefined}>
    <span class="friends-icon" aria-hidden="true"><Bot size={24} /></span>
    <span class="name">{m.bots.title}</span>
  </a>
  {#if app.layerMe}
    <a class="row friends" class:active={onInvitations} href={resolve('/app/channels/@me/invitations')} aria-current={onInvitations ? 'page' : undefined}>
      <span class="friends-icon" aria-hidden="true"><MailPlus size={24} /></span>
      <span class="name">{m.beta.row}</span>
    </a>
  {/if}
  <button class="row friends" onclick={() => (feedbackOpen = true)} aria-haspopup="dialog">
    <span class="friends-icon" aria-hidden="true"><Bug size={24} /></span>
    <span class="name">{m.feedback.row}</span>
  </button>
  {#if gates?.admin}
    <a class="row friends" class:active={onAdministration} href={resolve('/app/channels/@me/administration')} aria-current={onAdministration ? 'page' : undefined}>
      <span class="friends-icon" aria-hidden="true"><ShieldCheck size={24} /></span>
      <span class="name">{m.beta.adminRow}</span>
    </a>
  {/if}
  <h3 class="section">
    <span>{m.shell.directMessages}</span>
    {#if app.session}<IconButton size="sm" label={m.groups.newMessageButton} onclick={() => (picking = true)}><Plus size={16} /></IconButton>{/if}
  </h3>
  {#each dms as channel (channel.id)}
    {@const partner = dmPartner(store, channel)}
    {@const user = partner ? store.users.get(partner) : undefined}
    {@const unread = store.isUnread(channel.id)}
    {@const mentions = store.mentionCount(channel.id)}
    <div class="row-wrap">
    <a
      class="row" class:active={channel.id === active} class:unread
      href={resolve('/(app)/app/channels/@me/[channel]/[[message]]', { channel: channel.id })}
      aria-current={channel.id === active ? 'page' : undefined}
      use:menuOn={() => rowMenu(channel.id, partner)}
    >
      {#if channel.kind === 'group'}
        {#if channel.icon}
          <img use:fadeIn class="group-icon" src={fileUrl(channel.icon, { maxSide: 64 })} alt="" width="32" height="32" />
        {:else}
          <span class="group-icon initials" aria-hidden="true"><Users size={18} /></span>
        {/if}
      {:else}
        <Avatar src={avatarUrl(user ?? (partner ? { id: partner } : undefined))} size={32} presence={presenceOf(user)} />
      {/if}
      <span class="text">
        <span class="top">
          <span class="name">{channelName(store, channel)}</span>
          {#if partner}<TagBadge {store} user={partner} plain />{/if}
        </span>
        {#if channel.kind === 'group'}
          <span class="sub">{m.common.members(channel.recipients.length)}</span>
        {:else if statusTextOf(user)}
          <span class="sub">{statusTextOf(user)}</span>
        {/if}
      </span>
      {#if store.voice.has(channel.id)}<span class="call" role="img" aria-label={m.voiceState.inCall}><Volume2 size={16} /></span>{/if}
      {#if mentions}<Badge count={mentions} label={m.shell.mentions(mentions)} />{/if}
    </a>
    {#if channel.kind === 'dm' && app.session}
      {@const session = app.session}
      <span class="close"><IconButton size="sm" label={m.groups.closeDm} onclick={() => closeDm(session, channel.id)}><X size={14} /></IconButton></span>
    {/if}
    </div>
  {/each}
</nav>
{#if feedbackOpen}<FeedbackDialog onclose={() => (feedbackOpen = false)} />{/if}
{#if app.session}
  {@const session = app.session}
  <FriendPicker {session} open={picking} title={m.groups.newMessage} fresh max={room(session, 1)}
    onclose={() => (picking = false)} onpick={(users, name) => startConversation(session, users, name)} />
{/if}

<style>
  .search-header { display: flex; align-items: center; min-height: var(--header-h); padding: 0 var(--space-3); border-bottom: 1px solid var(--border-subtle); }
  .search {
    width: 100%; min-height: 1.75rem; border: 0; border-radius: var(--radius-md); background: var(--surface-3);
    color: var(--text-secondary); font: 500 var(--text-sm) var(--font-sans); cursor: default;
  }
  .dms { flex: 1; overflow-y: auto; padding: var(--space-3); }
  .section { display: flex; align-items: center; justify-content: space-between; margin: var(--space-6) var(--space-3) var(--space-3); color: var(--text-secondary); font: 500 var(--text-sm) var(--font-sans); }
  .row-wrap { position: relative; }
  .close { position: absolute; top: 50%; right: var(--space-3); translate: 0 -50%; display: none; }
  .row-wrap:hover .close, .row-wrap:focus-within .close { display: block; }
  .row-wrap:hover .row :global(.badge), .row-wrap:hover .call { visibility: hidden; }
  @media (pointer: coarse) { .close { display: none !important; } }
  .row {
    display: flex; align-items: center; gap: var(--space-4); min-height: var(--row-dm); margin-top: 2px; padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-md); color: var(--text-secondary); text-decoration: none;
  }
  :where(button).row { width: 100%; border: 0; background: none; text-align: left; cursor: pointer; }
  @media (hover: hover) { .row:hover { background: var(--hover-overlay); color: var(--text-normal); text-decoration: none; } }
  .row.active { background: var(--surface-5); color: var(--text-strong); }
  .row.unread { color: var(--text-strong); }
  .friends { min-height: var(--row-dm); font: 500 var(--text-md) var(--font-sans); }
  .friends-icon { display: grid; place-items: center; width: 32px; }
  .friends .name { flex: 1; }
  .group-icon { width: 32px; height: 32px; border-radius: 50%; flex: none; object-fit: cover; }
  .group-icon.initials { display: grid; place-items: center; background: var(--accent); color: var(--on-accent); }
  .text { display: grid; flex: 1; min-width: 0; }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 500 var(--text-md) var(--font-sans); }
  .call { display: grid; flex: none; color: var(--status-online); }
  .sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary); font: var(--text-xs) var(--font-sans); }
  .top { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
</style>
