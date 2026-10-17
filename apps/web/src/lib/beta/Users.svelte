<script lang="ts">
  /**
   * The platform's people, in Administration (admins only): who is an admin or a moderator, who is suspended, and
   * the actions on each: roles, a one-time password link, suspend. The layer holds no root, so each action is a
   * request to the account runner on the host, which checks the rules again and answers (architecture section 11.5).
   */
  import { Button, Dialog, IconButton, Menu, TextField, type MenuItem } from '@concord/ui';
  import type { AccountAction, PlatformUser } from '@concord/domain';
  import { BackendError } from '@concord/domain/errors';
  import EllipsisVertical from '@lucide/svelte/icons/ellipsis-vertical';
  import { m } from '$lib/i18n/index.ts';
  import { app } from '$lib/session/app.svelte.ts';
  import { confirm } from '$lib/view/confirm.svelte.ts';
  import { toasts } from '$lib/view/toast.svelte.ts';

  let users = $state<PlatformUser[] | null>(null);
  let problem = $state<'down' | 'failed' | null>(null);
  let query = $state('');
  let working = $state<string | null>(null);
  let menu = $state<{ user: PlatformUser; anchor: HTMLElement } | null>(null);
  let link = $state<{ name: string; url: string } | null>(null);

  const selfId = $derived(app.session?.store.selfId ?? null);
  const me = $derived(users?.find((u) => u.id === selfId));
  const nameOf = (u: PlatformUser) => u.displayName || u.username;
  const shown = $derived((users ?? []).filter((u) => {
    const q = query.trim().toLowerCase();
    return !q || `${u.displayName ?? ''} ${u.username}#${u.discriminator} ${u.id}`.toLowerCase().includes(q);
  }));

  async function load(): Promise<void> {
    const layer = app.layer;
    if (!layer) return;
    try {
      users = (await layer.platformUsers()).users;
      problem = null;
    } catch (e) {
      problem = e instanceof BackendError && e.kind === 'RunnerUnavailable' ? 'down' : 'failed';
    }
  }

  $effect(() => {
    void load();
    const timer = setInterval(() => void load(), 30_000);
    return () => clearInterval(timer);
  });

  /** Ask the runner and wait for its answer: the app itself restarts for an admin change, so a gap is expected. */
  async function run(action: AccountAction, user: PlatformUser): Promise<void> {
    const layer = app.layer;
    if (!layer || working) return;
    working = user.id;
    toasts.show(action.startsWith('admin:') ? m.accounts.restarting : m.accounts.working, 'info');
    try {
      const { id } = await layer.accountAction(action, user.id);
      for (let i = 0; i < 90; i++) {
        await new Promise((done) => setTimeout(done, 1_000));
        const answer = await layer.accountActionResult(id).catch(() => null);
        if (!answer || answer.status === 'pending') continue;
        if (answer.status === 'ok') {
          if (answer.link) link = { name: nameOf(user), url: answer.link };
          else toasts.show(answer.message ?? '', 'info');
        } else {
          toasts.show(answer.message || m.accounts.failed);
        }
        // The runner refreshes its list right after it answers.
        await new Promise((done) => setTimeout(done, 2_000));
        await load();
        return;
      }
      toasts.show(m.accounts.slow);
    } catch {
      toasts.show(m.accounts.failed);
    } finally {
      working = null;
    }
  }

  async function ask(action: AccountAction, user: PlatformUser, question?: { title: string; body: string; confirm: string; danger?: boolean }): Promise<void> {
    if (question && !(await confirm.ask(question))) return;
    await run(action, user);
  }

  /** What may be done to this person: the same rules the runner enforces, so the menu offers only what works. */
  function itemsFor(u: PlatformUser): MenuItem[] {
    const name = nameOf(u);
    const ownerMe = me?.owner === true;
    const self = u.id === selfId;
    const items: MenuItem[] = [];
    if (!u.disabled) {
      items.push(u.moderator
        ? { label: m.accounts.actions.moderatorRemove, onselect: () => void ask('moderator:remove', u) }
        : { label: m.accounts.actions.moderatorAdd, onselect: () => void ask('moderator:add', u) });
      if (!u.admin) items.push({ label: m.accounts.actions.adminAdd, onselect: () => void ask('admin:add', u, m.accounts.confirm.adminAdd(name)) });
    }
    if (u.admin && !u.owner && !self) items.push({ label: m.accounts.actions.adminRemove, danger: true, onselect: () => void ask('admin:remove', u, { ...m.accounts.confirm.adminRemove(name), danger: true }) });
    const mayReset = !u.disabled && (self || (!u.admin ? true : ownerMe));
    if (mayReset) items.push({ label: m.accounts.actions.passwordLink, onselect: () => void ask('password-link', u) });
    if (u.disabled) items.push({ label: m.accounts.actions.unsuspend, onselect: () => void ask('unsuspend', u) });
    else if (!self && !u.admin) items.push({ label: m.accounts.actions.suspend, danger: true, onselect: () => void ask('suspend', u, { ...m.accounts.confirm.suspend(name), danger: true }) });
    return items;
  }

  async function copyLink(): Promise<void> {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      toasts.show(m.accounts.link.copied, 'info');
    } catch {
      /* the field is selectable by hand */
    }
  }
</script>

{#if problem === 'down'}
  <p class="empty">{m.accounts.runnerDown}</p>
{:else if problem === 'failed' && users === null}
  <p class="empty">{m.accounts.loadFailed}</p>
{:else if users === null}
  <p class="empty" aria-live="polite">{m.accounts.loading}</p>
{:else}
  <TextField label={m.accounts.search} hideLabel type="search" placeholder={m.accounts.search} bind:value={query} />
  <p class="count" aria-live="polite">{m.accounts.count(shown.length)}</p>
  {#if shown.length}
    <ul>
      {#each shown as u (u.id)}
        {@const items = itemsFor(u)}
        <li class="row">
          <span class="text">
            <span class="name">{nameOf(u)}</span>
            <span class="sub">{u.username}#{u.discriminator}</span>
          </span>
          <span class="badges">
            {#if u.owner}<span class="badge owner">{m.accounts.badges.owner}</span>{:else if u.admin}<span class="badge admin">{m.accounts.badges.admin}</span>{/if}
            {#if u.moderator}<span class="badge">{m.accounts.badges.moderator}</span>{/if}
            {#if u.disabled}<span class="badge off">{m.accounts.badges.suspended}</span>{/if}
          </span>
          {#if items.length}
            <IconButton label={m.accounts.actions.label(nameOf(u))} aria-haspopup="menu" disabled={working !== null} onclick={(e) => (menu = { user: u, anchor: e.currentTarget })}><EllipsisVertical size={18} /></IconButton>
          {/if}
        </li>
      {/each}
    </ul>
  {:else}
    <p class="empty">{m.accounts.none}</p>
  {/if}
{/if}

<Menu open={!!menu} onclose={() => (menu = null)} items={menu ? itemsFor(menu.user) : []} anchor={menu?.anchor ?? null} label={menu ? m.accounts.actions.label(nameOf(menu.user)) : ''} />

<Dialog open={!!link} title={link ? m.accounts.link.title(link.name) : ''} onclose={() => (link = null)}>
  <p class="help">{m.accounts.link.help}</p>
  <input class="url" readonly value={link?.url ?? ''} aria-label={link ? m.accounts.link.title(link.name) : ''} onfocus={(e) => e.currentTarget.select()} />
  {#snippet actions()}
    <Button variant="secondary" onclick={() => void copyLink()}>{m.accounts.link.copy}</Button>
    <Button onclick={() => (link = null)}>{m.accounts.link.close}</Button>
  {/snippet}
</Dialog>

<style>
  .count { margin: var(--space-4) 0 var(--space-3); color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  ul { margin: 0; padding: 0; list-style: none; }
  .row { display: flex; align-items: center; gap: var(--space-4); min-height: 3.5rem; padding: 0 var(--space-3); border-top: 1px solid var(--border-subtle); border-radius: var(--radius-md); }
  .row:hover { background: var(--hover-overlay); border-top-color: transparent; }
  .text { display: grid; flex: 1; min-width: 0; }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-strong); font: 500 var(--text-md) var(--font-sans); }
  .sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  .badges { display: flex; flex-wrap: wrap; gap: var(--space-2); justify-content: flex-end; }
  .badge { padding: var(--space-1) var(--space-3); border-radius: var(--radius-full); background: var(--surface-3); color: var(--text-secondary); font: 500 var(--text-xs) var(--font-sans); }
  .badge.owner, .badge.admin { color: var(--text-strong); }
  .badge.off { color: var(--danger); }
  .empty { margin: var(--space-10) 0; text-align: center; color: var(--text-secondary); }
  .help { margin: 0 0 var(--space-4); color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  .url { width: 100%; min-height: var(--control-h); padding: 0 var(--space-4); background: var(--surface-0); color: var(--text-strong); border: 1px solid var(--border-control); border-radius: var(--radius-md); }
</style>
