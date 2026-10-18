<script lang="ts">
  /**
   * The admins' view, from the DM sidebar under Mentions: the platform's people with their roles and account
   * actions, and the requests members have made for beta invitations and server invites.
   */
  import { IconButton, Tabs } from '@concord/ui';
  import MenuIcon from '@lucide/svelte/icons/menu';
  import ShieldCheck from '@lucide/svelte/icons/shield-check';
  import { m } from '$lib/i18n/index.ts';
  import { app } from '$lib/session/app.svelte.ts';
  import { shell } from '$lib/view/shell.svelte.ts';
  import Invitations from './Invitations.svelte';
  import Users from './Users.svelte';
  import Reports from '$lib/admin/Reports.svelte';
  import Feedback from '$lib/feedback/Feedback.svelte';

  type Tab = 'users' | 'requests' | 'reports' | 'feedback';
  let tab = $state<Tab>('users');
  // Reports of DMs and people come here (m4.7-plan.md task 9), counted every minute.
  let waiting = $state(0);
  $effect(() => {
    const layer = app.layer;
    if (!layer || !app.layerMe?.gates.admin) return;
    const count = () => void layer.reportCount('admin').then((n) => (waiting = n), () => {});
    count();
    const timer = setInterval(count, 60_000);
    return () => clearInterval(timer);
  });
  const refused = $derived(!!app.layerMe && !app.layerMe.gates.admin);
</script>

<header class="header">
  <span class="narrow-only"><IconButton label={m.shell.openSidebar} onclick={() => (shell.sidebarOpen = true)}><MenuIcon /></IconButton></span>
  <span class="icon" aria-hidden="true"><ShieldCheck size={22} /></span>
  <h1>{m.beta.adminTitle}</h1>
  <span class="divider" aria-hidden="true"></span>
  <Tabs label={m.accounts.tabs.label} selected={tab} onselect={(id) => (tab = id as Tab)} tabs={[
    { id: 'users', label: m.accounts.tabs.users },
    { id: 'requests', label: m.accounts.tabs.requests },
    { id: 'reports', label: m.reports.count(waiting) },
    { id: 'feedback', label: m.feedback.tab },
  ]} />
</header>

<div class="body">
  <div class="content">
    {#if refused}
      <p class="empty">{m.beta.notAllowed}</p>
    {:else if tab === 'users'}
      <Users />
    {:else if tab === 'feedback'}
      {#if app.session}<Feedback session={app.session} />{/if}
    {:else if tab === 'reports'}
      {#if app.session}<Reports session={app.session} scope="admin" />{/if}
    {:else}
      <Invitations mode="review" embedded />
    {/if}
  </div>
</div>

<style>
  .header {
    display: flex; align-items: center; gap: var(--space-4); min-height: var(--header-h); padding: 0 var(--space-4) 0 var(--space-5);
    border-bottom: 1px solid var(--border-subtle); min-width: 0; overflow-x: auto; scrollbar-width: none;
  }
  .icon { display: grid; color: var(--text-muted); flex: none; }
  h1 { margin: 0; color: var(--text-strong); font: 500 var(--text-md) var(--font-sans); flex: none; }
  .divider { width: 1px; height: 1.5rem; background: var(--border-default); flex: none; }
  .body { flex: 1; min-height: 0; overflow-y: auto; padding: var(--space-5) var(--space-6); }
  .content { max-width: 46rem; }
  .empty { margin: var(--space-10) 0; text-align: center; color: var(--text-secondary); }
  .narrow-only { display: none; }
  @media (max-width: 700px) {
    .narrow-only { display: contents; }
    .divider, .icon { display: none; }
    .body { padding: var(--space-4); }
  }
</style>
