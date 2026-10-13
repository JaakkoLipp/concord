<script lang="ts">
  /** Profile contents for the popout and the DM profile panel (client.md section 7, reference screenshots). */
  import { Avatar } from '@concord/ui';
  import { fileUrl } from '@concord/stoat';
  import { memberKey, type Session, type Store } from '@concord/domain';
  import PersonActions from './PersonActions.svelte';
  import Markdown from '$lib/markdown/Markdown.svelte';
  import { setMarkdownContext } from '$lib/markdown/context.ts';
  import { dayLabel, ulidTime } from '$lib/markdown/time.ts';
  import { m } from '$lib/i18n/index.ts';
  import { avatarUrl, presenceOf, statusTextOf } from '$lib/view/users.ts';

  interface Props { store: Store; user: string; server: string | undefined; variant: 'popout' | 'panel'; session?: Session | undefined; inDm?: boolean }
  let { store, user, server, variant, session, inDm = false }: Props = $props();
  setMarkdownContext(() => ({ store, server }));

  const u = $derived(store.users.get(user));
  const member = $derived(server ? store.members.get(memberKey(server, user)) : undefined);
  const profile = $derived(store.profiles.get(user));
  const mutual = $derived(store.mutuals.get(user));
  const roles = $derived.by(() => {
    const s = server ? store.servers.get(server) : undefined;
    return (member?.roles ?? []).map((id) => s?.roles[id]).filter((r) => !!r).sort((a, b) => a!.rank - b!.rank);
  });
  const presence = $derived(presenceOf(u));
  const statusText = $derived(statusTextOf(u, store.selfId));
  const banner = $derived(profile?.background ? fileUrl(profile.background, { maxSide: 1024 }) : undefined);
</script>

<div class="card {variant}">
  <div class="banner" style:background-image={banner ? `url(${banner})` : undefined}></div>
  {#if session}<div class="actions"><PersonActions {session} {user} {inDm} /></div>{/if}
  <div class="avatar-wrap">
    <span class="avatar-ring"><Avatar src={avatarUrl(u ?? { id: user }, member?.avatar)} size={variant === 'popout' ? 80 : 80} {presence} presenceLabel={m.presence[presence]} /></span>
  </div>
  <div class="details">
    <h2 class="display">{store.displayName(user, server)}</h2>
    <p class="username">{u ? `${u.username}#${u.discriminator}` : ''}{#if u?.pronouns}<span class="dot" aria-hidden="true"></span>{u.pronouns}{/if}</p>
    {#if u?.bot}<span class="tag">{m.conversation.bot}</span>{/if}
    {#if statusText}<p class="status">{statusText}</p>{/if}

    {#if mutual && user !== store.selfId && (mutual.users.length || mutual.servers.length)}
      <p class="mutual">
        {#if mutual.users.length}{m.people.mutualFriends(mutual.users.length)}{/if}
        {#if mutual.users.length && mutual.servers.length}<span class="dot" aria-hidden="true"></span>{/if}
        {#if mutual.servers.length}{m.people.mutualServers(mutual.servers.length)}{/if}
      </p>
    {/if}

    {#if profile?.content}
      <section><h3>{m.people.about}</h3><div class="bio"><Markdown source={profile.content} /></div></section>
    {/if}

    <section class="since">
      {#if member}
        <div><h3>{m.people.memberSince}</h3><p>{dayLabel(new Date(member.joinedAt))}</p></div>
      {/if}
      <div><h3>{m.people.accountCreated}</h3><p>{dayLabel(ulidTime(user))}</p></div>
    </section>

    {#if roles.length}
      <section>
        <h3>{m.people.roles}</h3>
        <ul class="roles">
          {#each roles as role (role!.id)}<li><span class="swatch" style:--role={role!.colour ?? 'var(--text-muted)'}></span>{role!.name}</li>{/each}
        </ul>
      </section>
    {/if}
  </div>
</div>

<style>
  .card { position: relative; overflow: hidden; background: var(--surface-1); }
  .popout { width: var(--popout-w); max-width: calc(100vw - 2rem); border-radius: var(--radius-lg); }
  .panel { height: 100%; overflow-y: auto; background: var(--surface-2); }
  .banner { height: 7.5rem; background: var(--surface-5) center / cover no-repeat; }
  .panel .banner { height: 7.5rem; }
  .avatar-wrap { position: absolute; top: 4.75rem; left: var(--space-5); }
  .actions { position: absolute; top: calc(7.5rem + var(--space-3)); right: var(--space-4); z-index: 1; }
  .avatar-ring { display: inline-block; padding: 6px; border-radius: 50%; background: var(--surface-1); }
  .panel .avatar-ring { background: var(--surface-2); }
  .details { padding: 3.25rem var(--space-5) var(--space-5); display: grid; gap: var(--space-4); }
  .display { margin: 0; color: var(--text-strong); font: 700 var(--text-xl) var(--font-sans); overflow-wrap: anywhere; }
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
  .swatch { width: 10px; height: 10px; border-radius: 50%; background: var(--role); }
</style>
