<script lang="ts">
  /** Profile contents for the popout and the DM profile panel (client.md section 7, reference screenshots). */
  import TagBadge from './TagBadge.svelte';
  import { Avatar, IconButton, Menu } from '@concord/ui';
  import Plus from '@lucide/svelte/icons/plus';
  import { roleItem } from '$lib/admin/members.ts';
  import { fileUrl } from '@concord/stoat';
  import { memberKey, type Session, type Store } from '@concord/domain';
  import PersonActions from './PersonActions.svelte';
  import type { ProfilePreview } from './preview.ts';
  import Markdown from '$lib/markdown/Markdown.svelte';
  import { setMarkdownContext } from '$lib/markdown/context.ts';
  import { dayLabel, ulidTime } from '$lib/markdown/time.ts';
  import { m } from '$lib/i18n/index.ts';
  import { avatarUrl, presenceOf, statusTextOf } from '$lib/view/users.ts';

  interface Props { store: Store; user: string; server: string | undefined; variant: 'popout' | 'panel'; session?: Session | undefined; inDm?: boolean; preview?: ProfilePreview | undefined }
  let { store, user, server, variant, session, inDm = false, preview }: Props = $props();
  setMarkdownContext(() => ({ store, server }));

  const u = $derived(store.users.get(user));
  const roleMenu = $derived(session && server && !preview ? roleItem(session, server, user) : null);
  let roleAnchor = $state<HTMLElement | null>(null);
  let rolesOpen = $state(false);
  const member = $derived(server ? store.members.get(memberKey(server, user)) : undefined);
  const profile = $derived(store.profiles.get(user));
  const mutual = $derived(store.mutuals.get(user));
  const roles = $derived.by(() => {
    const s = server ? store.servers.get(server) : undefined;
    return (member?.roles ?? []).map((id) => s?.roles[id]).filter((r) => !!r).sort((a, b) => a!.rank - b!.rank);
  });
  // The popout shows a few role chips, then "+N", which shows the rest (m4.6-plan.md task 14). The + after them,
  // which gives and takes roles, replaces decision 10's read-only chips.
  const FEW_ROLES = 6;
  let allRoles = $state(false);
  $effect(() => { void user; allRoles = false; });
  const shownRoles = $derived(variant === 'popout' && !allRoles && roles.length > FEW_ROLES + 1 ? roles.slice(0, FEW_ROLES) : roles);
  const hiddenRoles = $derived(roles.length - shownRoles.length);
  const presence = $derived(presenceOf(u));
  const statusText = $derived(preview ? preview.statusText : statusTextOf(u, store.selfId));
  const name = $derived(preview ? preview.displayName || u?.username || '' : store.displayName(user, server));
  const pronouns = $derived(preview ? preview.pronouns : u?.pronouns);
  const bio = $derived(preview ? preview.bio : profile?.content);
  const banner = $derived(preview ? preview.banner ?? undefined : profile?.background ? fileUrl(profile.background, { maxSide: 1024 }) : undefined);
</script>

<div class="card {variant}">
  <div class="banner" style:background-image={banner ? `url(${banner})` : undefined}></div>
  {#if session}<div class="actions"><PersonActions {session} {user} {server} {inDm} round={variant === 'popout'} /></div>{/if}
  <div class="avatar-wrap">
    <span class="avatar-ring"><Avatar src={preview?.avatar ?? avatarUrl(u ?? { id: user }, member?.avatar)} size={variant === 'popout' ? 80 : 80} {presence} presenceLabel={m.presence[presence]} /></span>
  </div>
  <div class="details">
    <h2 class="display">{name}{#if !preview}<TagBadge {store} {user} />{/if}</h2>
    <p class="username">{u ? `${u.username}#${u.discriminator}` : ''}{#if pronouns}<span class="dot" aria-hidden="true"></span>{pronouns}{/if}</p>
    {#if u?.bot}<span class="tag">{m.conversation.bot}</span>{/if}
    {#if statusText}<p class="status">{statusText}</p>{/if}

    {#if mutual && user !== store.selfId && (mutual.users.length || mutual.servers.length)}
      <p class="mutual">
        {#if mutual.users.length}{m.people.mutualFriends(mutual.users.length)}{/if}
        {#if mutual.users.length && mutual.servers.length}<span class="dot" aria-hidden="true"></span>{/if}
        {#if mutual.servers.length}{m.people.mutualServers(mutual.servers.length)}{/if}
      </p>
    {/if}

    {#if bio}
      <section><h3>{m.people.about}</h3><div class="bio"><Markdown source={bio} /></div></section>
    {/if}

    <section class="since">
      {#if member}
        <div><h3>{m.people.memberSince}</h3><p>{dayLabel(new Date(member.joinedAt))}</p></div>
      {/if}
      <div><h3>{m.people.accountCreated}</h3><p>{dayLabel(ulidTime(user))}</p></div>
    </section>

    {#if roles.length || roleMenu}
      <section>
        <h3>{m.people.roles}</h3>
        <ul class="roles">
          {#each shownRoles as role (role!.id)}<li><span class="swatch" style:--role={role!.colour ?? 'var(--text-muted)'}></span>{role!.name}</li>{/each}
          {#if hiddenRoles}<li class="more"><button aria-label={m.people.moreRolesLabel(hiddenRoles)} onclick={() => (allRoles = true)}>{m.people.moreRoles(hiddenRoles)}</button></li>{/if}
          {#if roleMenu}<li><span bind:this={roleAnchor}><IconButton size="sm" label={m.admin.roles.memberRoles} aria-haspopup="menu" onclick={() => (rolesOpen = !rolesOpen)}><Plus size={16} /></IconButton></span></li>{/if}
        </ul>
      </section>
    {/if}
  </div>
</div>
{#if roleMenu && roleMenu !== 'separator' && 'kind' in roleMenu && roleMenu.kind === 'submenu'}
  <Menu open={rolesOpen} onclose={() => (rolesOpen = false)} anchor={roleAnchor} label={m.people.roles} items={roleMenu.items} />
{/if}

<style>
  .card { position: relative; overflow: hidden; background: var(--surface-1); }
  /* The popout, m4.6-plan.md task 14: 300 px, a 105 px banner with round buttons at its top right, a 20 px name. */
  .popout { width: var(--profile-w); max-width: calc(100vw - 2rem); border-radius: var(--radius-md); }
  .panel { height: 100%; overflow-y: auto; background: var(--surface-2); }
  .banner { height: 6.5625rem; background: var(--surface-5) center / cover no-repeat; }
  .panel .banner { height: 7.5rem; }
  .avatar-wrap { position: absolute; top: 3.6875rem; left: var(--space-5); }
  .panel .avatar-wrap { top: 4.75rem; }
  .actions { position: absolute; top: var(--space-3); right: var(--space-3); z-index: 1; }
  .panel .actions { top: calc(7.5rem + var(--space-3)); right: var(--space-4); }
  .avatar-ring { display: inline-block; padding: 6px; border-radius: 50%; background: var(--surface-1); }
  .panel .avatar-ring { background: var(--surface-2); }
  .details { padding: 3.25rem var(--space-5) var(--space-5); display: grid; gap: var(--space-4); }
  .display { margin: 0; color: var(--text-strong); font: 700 var(--text-xl) var(--font-sans); overflow-wrap: anywhere; }
  .popout .display { font: 700 var(--text-lg) var(--font-sans); }
  .username { margin: -0.5rem 0 0; display: flex; align-items: center; gap: var(--space-2); color: var(--text-normal); font: var(--text-sm) var(--font-sans); }
  .dot { width: 4px; height: 4px; border-radius: 50%; background: var(--text-secondary); display: inline-block; }
  .tag { justify-self: start; padding: 0 var(--space-2); border-radius: var(--radius-xs); background: var(--accent); color: var(--on-accent); font: 700 0.625rem/1rem var(--font-sans); text-transform: uppercase; }
  .status { margin: 0; color: var(--text-normal); font: var(--text-sm) var(--font-sans); }
  .mutual { margin: 0; display: flex; align-items: center; gap: var(--space-2); color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  section { display: grid; gap: var(--space-2); }
  h3 { margin: 0; color: var(--text-secondary); font: 700 var(--text-xs) var(--font-sans); }
  .bio { color: var(--text-normal); font: var(--text-sm) var(--font-sans); }
  .since { grid-auto-flow: column; justify-content: start; gap: var(--space-8); }
  .since p { margin: 0; color: var(--text-normal); font: var(--text-sm) var(--font-sans); }
  .roles { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--space-2); }
  .roles li {
    display: inline-flex; align-items: center; gap: var(--space-2); padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-xs); background: var(--surface-4); color: var(--text-normal); font: 500 var(--text-xs) var(--font-sans);
  }
  .roles .more { padding: 0; }
  .more button { padding: var(--space-1) var(--space-3); border: 0; border-radius: inherit; background: none; color: var(--text-secondary); font: inherit; }
  @media (hover: hover) { .more button:hover { background: var(--hover-overlay); color: var(--text-strong); } }
  .swatch { width: 10px; height: 10px; border-radius: 50%; background: var(--role); }
</style>
