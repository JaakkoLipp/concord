<script lang="ts">
  import Logo from '$lib/brand/Logo.svelte';
  // The invite page (m3-plan.md task 7): /invite/<code> links redirect here. It previews the invite signed out,
  // then joins once signed in. Accounts are still made by hand, so it never offers registration.
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { Button } from '@concord/ui';
  import { StoatError, fileUrl } from '@concord/stoat';
  import { memberKey, type Id, type InvitePreview } from '@concord/domain';
  import { m } from '$lib/i18n/index.ts';
  import { app, backend } from '$lib/session/app.svelte.ts';

  const code = $derived(page.params.code ?? '');
  let preview = $state<InvitePreview | null>(null);
  let error = $state('');
  let busy = $state(false);

  const explain = (e: unknown) =>
    e instanceof StoatError
      ? e.status === 404 || e.kind === 'NotFound' ? m.invitePage.errors.invalid : e.kind === 'Banned' ? m.invitePage.errors.banned : m.invitePage.errors.unknown
      : e instanceof TypeError ? m.invitePage.errors.network : m.invitePage.errors.unknown;

  $effect(() => {
    const c = code;
    preview = null;
    error = '';
    backend.invite(c).then((p) => { if (c === code) preview = p; }, (e: unknown) => { if (c === code) error = explain(e); });
  });

  const store = $derived(app.session?.store);
  const member = $derived(!!preview && !!store && (preview.kind === 'server' ? store.servers.has(preview.server) : store.channels.has(preview.channel)));

  function open(p: InvitePreview, channel: Id = p.channel) {
    return p.kind === 'server'
      ? goto(resolve('/(app)/app/channels/[server]/[channel]/[[message]]', { server: p.server, channel }), { replaceState: true })
      : goto(resolve('/(app)/app/channels/@me/[channel]/[[message]]', { channel }), { replaceState: true });
  }

  /**
   * The join's own response comes first. The socket's ServerCreate fills the store a moment later, and the session
   * then fetches our own member record, without which every channel looks hidden. Wait for both, up to 5 s.
   */
  const ready = (p: InvitePreview) =>
    p.kind === 'server' ? !!store?.servers.has(p.server) && !!store.selfId && store.members.has(memberKey(p.server, store.selfId)) : !!store?.channels.has(p.channel);
  async function arrived(p: InvitePreview): Promise<void> {
    for (let i = 0; i < 50 && !ready(p); i++) await new Promise((r) => setTimeout(r, 100));
  }

  async function join() {
    const p = preview;
    if (!p || busy) return;
    if (member) return void open(p);
    busy = true;
    error = '';
    try {
      await backend.joinInvite(p.code);
      await arrived(p);
      await open(p);
    } catch (e) {
      if (e instanceof StoatError && (e.kind === 'AlreadyInServer' || e.kind === 'AlreadyInGroup')) return void open(p);
      error = explain(e);
    } finally {
      busy = false;
    }
  }

  // eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve() plus a query string
  const login = () => goto(`${resolve('/app/login')}?next=${encodeURIComponent(page.url.pathname)}`);
</script>

<main class="page">
  <div class="brand"><Logo size="var(--avatar-md)" /><span>{m.app.name}</span></div>
  <div class="card">
    {#if preview}
      {#if preview.kind === 'server'}
        {#if preview.icon}
          <img class="icon" src={fileUrl(preview.icon, { maxSide: 128 })} alt="" width="80" height="80" />
        {:else}
          <div class="icon initials" aria-hidden="true">{preview.name.slice(0, 2)}</div>
        {/if}
        <p class="sub">{m.invitePage.invitedBy(preview.inviter)}</p>
        <h1>{preview.name}</h1>
        <p class="meta">{m.common.members(preview.members)} · {m.invitePage.channel(preview.channelName)}</p>
      {:else}
        <p class="sub">{m.invitePage.invitedToGroup(preview.inviter)}</p>
        <h1>{preview.name}</h1>
      {/if}
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      {#if app.status === 'signed-in'}
        <Button wide {busy} onclick={join}>{member ? m.invitePage.open : m.invitePage.join}</Button>
      {:else if app.status === 'signed-out'}
        <Button wide onclick={login}>{m.invitePage.logIn}</Button>
        <p class="note">{m.invitePage.noAccount}</p>
      {/if}
    {:else if error}
      <p class="error" role="alert">{error}</p>
    {:else}
      <p class="sub" aria-live="polite">{m.invitePage.loading}</p>
    {/if}
  </div>
</main>

<style>
  .page { display: grid; place-items: center; align-content: center; gap: var(--space-6); min-height: 100dvh; padding: var(--space-5); overflow: auto; }
  .brand { display: flex; align-items: center; gap: var(--space-3); color: var(--text-strong); font: 700 var(--text-xl) var(--font-sans); }
  .card {
    display: grid; justify-items: center; gap: var(--space-4);
    width: min(100%, 30rem); padding: var(--space-8);
    background: var(--surface-1); border: 1px solid var(--border-default); border-radius: var(--radius-xl);
    text-align: center;
  }
  .card :global(button) { margin-top: var(--space-4); }
  .icon { width: 80px; height: 80px; border-radius: var(--radius-xl); object-fit: cover; }
  .initials {
    display: grid; place-items: center; background: var(--surface-3); color: var(--text-strong);
    font: 700 var(--text-xl) var(--font-sans);
  }
  h1 { margin: 0; color: var(--text-strong); font: 700 var(--text-xl) var(--font-sans); overflow-wrap: anywhere; }
  .sub { margin: 0; color: var(--text-secondary); font: var(--text-md) var(--font-sans); }
  .meta { margin: 0; color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  .note { margin: 0; color: var(--text-secondary); font: var(--text-xs) var(--font-sans); }
  .error { margin: 0; color: var(--danger); font: var(--text-sm) var(--font-sans); }
</style>
