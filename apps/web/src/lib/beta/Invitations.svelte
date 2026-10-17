<script lang="ts">
  /**
   * Closed-beta invitations (admins and moderators), from the DM sidebar under Mentions: create an invitation
   * for a friend's email and copy the link that creates their account. Admins and moderators are approved at
   * once; admins also see every invitation and review requests that came in from other accounts.
   */
  import { Button, IconButton, TextField } from '@concord/ui';
  import type { BetaInvitation } from '@concord/domain';
  import { BackendError } from '@concord/domain/errors';
  import MailPlus from '@lucide/svelte/icons/mail-plus';
  import MenuIcon from '@lucide/svelte/icons/menu';
  import { resolve } from '$app/paths';
  import { m } from '$lib/i18n/index.ts';
  import { app } from '$lib/session/app.svelte.ts';
  import { shell } from '$lib/view/shell.svelte.ts';
  import { shortDate } from '$lib/markdown/time.ts';
  import { toasts } from '$lib/view/toast.svelte.ts';

  const gate = $derived(app.layerMe?.gates);
  const admin = $derived(gate?.admin === true);
  const allowed = $derived(gate?.admin === true || gate?.serverCreator === true);
  let rows = $state<BetaInvitation[] | null>(null);
  let loadFailed = $state(false);
  let email = $state('');
  let busy = $state(false);
  let working = $state<string | null>(null);

  const pending = $derived((rows ?? []).filter((r) => r.status === 'pending'));
  const rest = $derived((rows ?? []).filter((r) => r.status !== 'pending'));

  async function load(): Promise<void> {
    const layer = app.layer;
    if (!layer) return;
    try {
      rows = await layer.betaInvitations(admin);
      loadFailed = false;
    } catch {
      loadFailed = true;
    }
  }

  $effect(() => {
    if (allowed) void load();
  });

  const link = (token: string) => `${location.origin}${resolve('/(app)/app/beta/[token]', { token })}`;

  /** Mint a fresh link (the old one stops working) and put it on the clipboard. */
  async function copy(id: string, announce = true): Promise<boolean> {
    const layer = app.layer;
    if (!layer) return false;
    try {
      const { token } = await layer.betaInvitationLink(id);
      await navigator.clipboard.writeText(link(token));
      if (announce) toasts.show(m.beta.copied, 'info');
      return true;
    } catch {
      if (announce) toasts.show(m.beta.errors.copy);
      return false;
    }
  }

  function reason(e: unknown): string {
    if (e instanceof BackendError) {
      switch (e.kind) {
        case 'InvalidEmail': return m.beta.errors.invalidEmail;
        case 'InvitationPending': return m.beta.errors.pending;
        case 'InvitationLimit': return m.beta.errors.limit;
        case 'RateLimited': return m.beta.errors.rate;
      }
    }
    return m.beta.errors.create;
  }

  async function create(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    const layer = app.layer;
    const address = email.trim();
    if (!layer || !address || busy) return;
    busy = true;
    try {
      const row = await layer.requestBetaInvitation(address);
      email = '';
      if (row.status === 'approved') {
        await copy(row.id, false);
        toasts.show(m.beta.created, 'info');
      } else {
        toasts.show(m.beta.pendingCreated, 'info');
      }
      await load();
    } catch (e) {
      toasts.show(reason(e));
    } finally {
      busy = false;
    }
  }

  async function review(id: string, action: 'approve' | 'decline'): Promise<void> {
    const layer = app.layer;
    if (!layer || working) return;
    working = id;
    try {
      await layer.reviewBetaInvitation(id, action);
      await load();
    } catch {
      toasts.show(m.beta.errors.change);
    } finally {
      working = null;
    }
  }
</script>

{#snippet invitation(row: BetaInvitation)}
  <li class="row">
    <span class="text">
      <span class="mail">{row.email}</span>
      <span class="sub">
        <span class="status s-{row.status}">{m.beta.statuses[row.status]}</span>
        {#if row.status === 'approved' && row.expiresAt} · {m.beta.expires(shortDate(new Date(row.expiresAt)))} · {shortDate(new Date(row.createdAt))}{:else} · {shortDate(new Date(row.createdAt))}{/if}
      </span>
    </span>
    <span class="actions">
      {#if row.status === 'pending' && admin}
        <Button size="sm" variant="secondary" busy={working === row.id} onclick={() => void review(row.id, 'approve')}>{m.beta.approve}</Button>
        <Button size="sm" variant="ghost" disabled={working === row.id} onclick={() => void review(row.id, 'decline')}>{m.beta.decline}</Button>
      {:else if row.status === 'approved'}
        <Button size="sm" variant="secondary" onclick={() => void copy(row.id)}>{m.beta.copy}</Button>
      {/if}
    </span>
  </li>
{/snippet}

<header class="header">
  <span class="narrow-only"><IconButton label={m.shell.openSidebar} onclick={() => (shell.sidebarOpen = true)}><MenuIcon /></IconButton></span>
  <span class="icon" aria-hidden="true"><MailPlus size={22} /></span>
  <h1>{m.beta.title}</h1>
</header>

<div class="body">
  <div class="content">
    {#if !app.layer}
      <p class="empty">{m.beta.loadFailed}</p>
    {:else if app.layerMe && !allowed}
      <p class="empty">{m.beta.notAllowed}</p>
    {:else}
      <section class="new" aria-labelledby="beta-new">
        <h2 id="beta-new">{m.beta.newTitle}</h2>
        <p class="help">{m.beta.help}</p>
        <form onsubmit={create}>
          <TextField label={m.beta.email} hideLabel type="email" name="email" autocomplete="off" placeholder={m.beta.emailPlaceholder} bind:value={email} disabled={busy}>
            {#snippet trailing()}
              <Button type="submit" size="sm" busy={busy} disabled={!email.trim()}>{m.beta.create}</Button>
            {/snippet}
          </TextField>
        </form>
      </section>

      {#if loadFailed}
        <p class="empty">{m.beta.loadFailed}</p>
      {:else if rows === null}
        <p class="empty" aria-live="polite">{m.app.loading}</p>
      {:else if !rows.length}
        <p class="empty">{m.beta.empty}</p>
      {:else}
        {#if admin && pending.length}
          <h2 class="heading" id="beta-review">{m.beta.review}</h2>
          <ul aria-labelledby="beta-review">{#each pending as row (row.id)}{@render invitation(row)}{/each}</ul>
        {/if}
        {#if rest.length}
          <h2 class="heading" id="beta-all">{m.beta.all}</h2>
          <ul aria-labelledby="beta-all">{#each rest as row (row.id)}{@render invitation(row)}{/each}</ul>
        {/if}
      {/if}
    {/if}
  </div>
</div>

<style>
  .header {
    display: flex; align-items: center; gap: var(--space-4); min-height: var(--header-h); padding: 0 var(--space-4) 0 var(--space-5);
    border-bottom: 1px solid var(--border-subtle); min-width: 0;
  }
  .icon { display: grid; color: var(--text-muted); flex: none; }
  h1 { margin: 0; color: var(--text-strong); font: 500 var(--text-md) var(--font-sans); flex: none; }
  .body { flex: 1; min-height: 0; overflow-y: auto; padding: var(--space-5) var(--space-6); }
  .content { max-width: 46rem; }
  .new h2 { margin: 0 0 var(--space-2); color: var(--text-strong); font: 700 var(--text-lg) var(--font-sans); }
  .help { margin: 0 0 var(--space-4); color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  .heading { margin: var(--space-8) 0 var(--space-3); color: var(--text-secondary); font: 500 var(--text-xs) var(--font-sans); letter-spacing: 0.02em; text-transform: uppercase; }
  ul { margin: 0; padding: 0; list-style: none; }
  .row { display: flex; align-items: center; gap: var(--space-4); min-height: 3.75rem; padding: 0 var(--space-3); border-top: 1px solid var(--border-subtle); border-radius: var(--radius-md); }
  .row:hover { background: var(--hover-overlay); border-top-color: transparent; }
  .text { display: grid; flex: 1; min-width: 0; }
  .mail { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-strong); font: 500 var(--text-md) var(--font-sans); }
  .sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  .status { font-weight: 500; }
  .s-pending, .s-claiming { color: var(--text-muted); }
  .s-approved { color: var(--status-online); }
  .s-used { color: var(--text-secondary); }
  .s-declined, .s-failed { color: var(--danger); }
  .actions { display: flex; gap: var(--space-3); flex: none; }
  .empty { margin: var(--space-10) 0; text-align: center; color: var(--text-secondary); }
  .narrow-only { display: none; }
  @media (max-width: 700px) {
    .narrow-only { display: contents; }
    .icon { display: none; }
    .body { padding: var(--space-4); }
  }
</style>
