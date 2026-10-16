<script lang="ts">
  /**
   * The friends screen at @me (client.md section 7, m2b-plan.md task 2): online, all, pending and blocked
   * lists with a search box, and "Add friend" by name#1234.
   */
  import { Avatar, Button, IconButton, Menu, Tabs, TextField, type MenuItem } from '@concord/ui';
  import type { Session, User } from '@concord/domain';
  import Check from '@lucide/svelte/icons/check';
  import EllipsisVertical from '@lucide/svelte/icons/ellipsis-vertical';
  import MenuIcon from '@lucide/svelte/icons/menu';
  import MessageCircle from '@lucide/svelte/icons/message-circle';
  import UserRoundX from '@lucide/svelte/icons/user-round-x';
  import Users from '@lucide/svelte/icons/users';
  import X from '@lucide/svelte/icons/x';
  import { m } from '$lib/i18n/index.ts';
  import { shell } from '$lib/view/shell.svelte.ts';
  import { avatarUrl, presenceOf, statusTextOf } from '$lib/view/users.ts';
  import * as act from './actions.ts';
  import { menuOn } from '$lib/view/contextmenu.svelte.ts';
  import { popout } from '$lib/view/popout.svelte.ts';
  import { participantMenu } from '$lib/call/menu.ts';
  import { app } from '$lib/session/app.svelte.ts';

  type TabId = 'online' | 'all' | 'pending' | 'blocked' | 'add';
  let { session }: { session: Session } = $props();
  const store = $derived(session.store);
  let tab = $state<TabId>('online');
  let query = $state('');
  let tag = $state('');
  let addError = $state<string | undefined>();
  let addDone = $state<string | undefined>();
  let sending = $state(false);
  let copied = $state(false);
  let menu = $state<{ items: MenuItem[]; anchor: HTMLElement } | null>(null);

  const friends = $derived(store.related('Friend'));
  const incoming = $derived(store.related('Incoming'));
  const outgoing = $derived(store.related('Outgoing'));
  const blocked = $derived(store.related('Blocked'));
  const self = $derived(store.self);

  const matches = (u: User) => {
    const q = query.trim().toLocaleLowerCase();
    return !q || u.username.toLocaleLowerCase().includes(q) || !!u.displayName?.toLocaleLowerCase().includes(q);
  };
  const sections = $derived.by((): { title: string; users: User[] }[] => {
    const f = (list: User[]) => list.filter(matches);
    switch (tab) {
      case 'online': { const l = f(friends.filter((u) => presenceOf(u) !== 'offline')); return [{ title: m.friends.heading.online(l.length), users: l }]; }
      case 'all': { const l = f(friends); return [{ title: m.friends.heading.all(l.length), users: l }]; }
      case 'pending': {
        const i = f(incoming);
        const o = f(outgoing);
        return [...(i.length ? [{ title: m.friends.heading.incoming(i.length), users: i }] : []), ...(o.length ? [{ title: m.friends.heading.outgoing(o.length), users: o }] : [])];
      }
      case 'blocked': { const l = f(blocked); return [{ title: m.friends.heading.blocked(l.length), users: l }]; }
      default: return [];
    }
  });
  const empty = $derived(sections.every((s) => !s.users.length));

  async function add(e: SubmitEvent) {
    e.preventDefault();
    const t = tag.trim();
    addDone = undefined;
    if (!/^[^#\s]+#\d{4}$/.test(t)) {
      addError = m.friends.errors.format;
      return;
    }
    sending = true;
    try {
      await session.addFriend(t);
      addError = undefined;
      addDone = m.friends.sent(t);
      tag = '';
    } catch (err) {
      addError = act.friendError(session, err);
    } finally {
      sending = false;
    }
  }

  async function copyTag() {
    if (!self) return;
    await navigator.clipboard?.writeText(`${self.username}#${self.discriminator}`).catch(() => {});
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }

  function subline(u: User): string {
    switch (u.relationship) {
      case 'Incoming': return m.friends.incoming;
      case 'Outgoing': return m.friends.outgoing;
      case 'Blocked': return m.friends.blocked;
      // Voice states cover only channels this account can see (client.md section 7).
      default: return store.voiceChannelOf(u.id) ? m.voiceState.inVoice : statusTextOf(u) || m.presence[presenceOf(u)];
    }
  }
</script>

<header class="header">
  <span class="narrow-only"><IconButton label={m.shell.openSidebar} onclick={() => (shell.sidebarOpen = true)}><MenuIcon /></IconButton></span>
  <span class="icon" aria-hidden="true"><Users size={22} /></span>
  <h1>{m.friends.title}</h1>
  <span class="divider" aria-hidden="true"></span>
  <Tabs label={m.friends.lists} selected={tab} onselect={(id) => (tab = id as TabId)} tabs={[
    { id: 'online', label: m.friends.tabs.online },
    { id: 'all', label: m.friends.tabs.all },
    { id: 'pending', label: m.friends.tabs.pending, badge: incoming.length, badgeLabel: m.friends.waiting(incoming.length) },
    { id: 'blocked', label: m.friends.tabs.blocked },
  ]} />
  <span class="add-tab"><Button size="sm" variant={tab === 'add' ? 'secondary' : 'primary'} aria-pressed={tab === 'add'} onclick={() => (tab = 'add')}>{m.friends.add}</Button></span>
</header>

<div class="body">
  {#if tab === 'add'}
    <section class="add" aria-labelledby="add-title">
      <h2 id="add-title">{m.friends.add}</h2>
      <p class="help">{m.friends.addHelp}</p>
      <form onsubmit={add}>
        <TextField label={m.friends.addLabel} hideLabel placeholder={m.friends.addPlaceholder} bind:value={tag} autocomplete="off" spellcheck="false"
          error={addError} hint={addDone} oninput={() => { addError = undefined; addDone = undefined; }}>
          {#snippet trailing()}<Button size="sm" type="submit" busy={sending} disabled={!tag.trim()}>{m.friends.send}</Button>{/snippet}
        </TextField>
      </form>
      {#if self}
        <h3>{m.friends.yourName}</h3>
        <p class="help">{m.friends.yourNameHelp}</p>
        <div class="tag">
          <code>{self.username}#{self.discriminator}</code>
          <Button size="sm" variant="secondary" onclick={copyTag}>{copied ? m.friends.copied : m.friends.copy}</Button>
        </div>
      {/if}
    </section>
  {:else}
    <div class="search"><TextField label={m.friends.search} hideLabel type="search" placeholder={m.friends.search} bind:value={query} /></div>
    <div role="tabpanel" aria-labelledby="tab-{tab}" class="lists">
      {#if empty}
        <p class="empty">{query.trim() ? m.friends.empty.search : m.friends.empty[tab]}</p>
      {:else}
        {#each sections as section (section.title)}
          {#if section.users.length}
            <h2 class="heading">{section.title}</h2>
            <ul>
              {#each section.users as u (u.id)}
                {@const presence = presenceOf(u)}
                <li class="row" data-user={u.id} use:menuOn={(node) => participantMenu(session, app.voice, u.id, { profile: () => popout.open(u.id, undefined, node) })}>
                  <svelte:element this={u.relationship === 'Friend' ? 'button' : 'div'} class="who" role={u.relationship === 'Friend' ? undefined : 'presentation'}
                    onclick={u.relationship === 'Friend' ? () => void act.message(session, u.id) : undefined}>
                    <Avatar src={avatarUrl(u)} size={32} presence={u.relationship === 'Friend' ? presence : undefined} presenceLabel={m.presence[presence]} />
                    <span class="text">
                      <span class="name">{u.displayName ?? u.username}<span class="tagline">{u.username}#{u.discriminator}</span></span>
                      <span class="sub">{subline(u)}</span>
                    </span>
                  </svelte:element>
                  <span class="actions">
                    {#if u.relationship === 'Friend'}
                      <IconButton label={m.friends.actions.message} onclick={() => void act.message(session, u.id)}><MessageCircle size={18} /></IconButton>
                      <IconButton label={m.friends.actions.more} aria-haspopup="menu" onclick={(e) => (menu = { items: act.friendMenu(session, u.id), anchor: e.currentTarget as HTMLElement })}><EllipsisVertical size={18} /></IconButton>
                    {:else if u.relationship === 'Incoming'}
                      <IconButton label={m.friends.actions.accept} onclick={() => act.accept(session, u.id)}><Check size={18} /></IconButton>
                      <IconButton label={m.friends.actions.ignore} onclick={() => act.dropRequest(session, u.id)}><X size={18} /></IconButton>
                    {:else if u.relationship === 'Outgoing'}
                      <IconButton label={m.friends.actions.cancel} onclick={() => act.dropRequest(session, u.id)}><X size={18} /></IconButton>
                    {:else if u.relationship === 'Blocked'}
                      <IconButton label={m.friends.actions.unblock} onclick={() => act.unblock(session, u.id)}><UserRoundX size={18} /></IconButton>
                    {/if}
                  </span>
                </li>
              {/each}
            </ul>
          {/if}
        {/each}
      {/if}
    </div>
  {/if}
</div>

<Menu open={!!menu} onclose={() => (menu = null)} items={menu?.items ?? []} anchor={menu?.anchor ?? null} label={m.friends.actions.more} />

<style>
  .header {
    display: flex; align-items: center; gap: var(--space-4); min-height: var(--header-h); padding: 0 var(--space-4) 0 var(--space-5);
    border-bottom: 1px solid var(--border-subtle); min-width: 0; overflow-x: auto; scrollbar-width: none;
  }
  .icon { display: grid; color: var(--text-muted); flex: none; }
  h1 { margin: 0; color: var(--text-strong); font: 500 var(--text-md) var(--font-sans); flex: none; }
  .divider { width: 1px; height: 1.5rem; background: var(--border-default); flex: none; }
  .add-tab { flex: none; }
  .body { flex: 1; min-height: 0; overflow-y: auto; padding: var(--space-5) var(--space-6); }
  .search { margin-bottom: var(--space-5); }
  .heading { margin: 0 0 var(--space-3); color: var(--text-secondary); font: 500 var(--text-xs) var(--font-sans); letter-spacing: 0.02em; text-transform: uppercase; }
  ul { margin: 0 0 var(--space-6); padding: 0; list-style: none; }
  .row {
    display: flex; align-items: center; gap: var(--space-4); min-height: 3.75rem; padding: 0 var(--space-3);
    border-top: 1px solid var(--border-subtle); border-radius: var(--radius-md);
  }
  .row:hover { background: var(--hover-overlay); border-top-color: transparent; }
  .row:hover + .row { border-top-color: transparent; }
  .who { display: flex; align-items: center; gap: var(--space-4); flex: 1; min-width: 0; padding: var(--space-3) 0; border: 0; background: none; text-align: left; color: inherit; }
  button.who { cursor: pointer; }
  .text { display: grid; min-width: 0; }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-strong); font: 500 var(--text-md) var(--font-sans); }
  .tagline { margin-left: var(--space-3); color: var(--text-secondary); font: var(--text-sm) var(--font-sans); visibility: hidden; }
  .row:hover .tagline { visibility: visible; }
  .sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  .actions { display: flex; gap: var(--space-3); flex: none; }
  .actions :global(.icon-button) { width: 2.25rem; height: 2.25rem; border-radius: var(--radius-full); background: var(--surface-3); }
  .empty { margin: var(--space-10) 0; text-align: center; color: var(--text-secondary); }
  .add { max-width: 44rem; }
  .add h2 { margin: 0 0 var(--space-2); color: var(--text-strong); font: 700 var(--text-lg) var(--font-sans); }
  .add h3 { margin: var(--space-8) 0 var(--space-2); color: var(--text-strong); font: 700 var(--text-md) var(--font-sans); }
  .help { margin: 0 0 var(--space-4); color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  .tag { display: flex; align-items: center; gap: var(--space-4); }
  code { padding: var(--space-2) var(--space-4); border-radius: var(--radius-md); background: var(--surface-3); color: var(--text-strong); font: 500 var(--text-md) var(--font-sans); }
  .narrow-only { display: none; }
  @media (max-width: 700px) {
    .narrow-only { display: contents; }
    .divider, .icon { display: none; }
    .body { padding: var(--space-4); }
    .tagline { display: none; }
  }
</style>
