<script lang="ts">
  /**
   * User settings, My account (M4.8 task 8): the email and changing it, the password, and the devices signed in.
   * Self-contained, dialogs included, so it moves as one piece when settings become a modal (M4.6 task 16a).
   * Which actions need an MFA ticket follows m4.8-results.md probe 2; identity.svelte.ts gets a fresh one each time.
   * The email form shows only where the server sends mail (probe 5), and "This device" only for a session this
   * browser logged in itself, since Stoat can't say which session a stored token belongs to (probe 6).
   */
  import { onMount } from 'svelte';
  import { Button, Dialog, TextField } from '@concord/ui';
  import type { AccountSession, Session } from '@concord/domain';
  import { m } from '$lib/i18n/index.ts';
  import { app } from '$lib/session/app.svelte.ts';
  import { toasts } from '$lib/view/toast.svelte.ts';
  import { accountError } from './accountErrors.ts';
  import { identity } from './identity.svelte.ts';
  import ConfirmIdentity from './ConfirmIdentity.svelte';

  let { session }: { session: Session } = $props();
  const backend = $derived(session.backend);
  const t = m.account;
  const canChangeEmail = $derived(!!session.store.node?.email);

  let email = $state<string | null>(null);
  let sessions = $state<AccountSession[] | null>(null);
  let loadError = $state(false);
  // Newest first: Stoat's IDs are ULIDs, so they sort by when the session began.
  const listed = $derived((sessions ?? []).toSorted((a, b) => (a.id === app.sessionId ? -1 : b.id === app.sessionId ? 1 : b.id.localeCompare(a.id))));
  const known = $derived(!!app.sessionId && !!sessions?.some((s) => s.id === app.sessionId));
  const others = $derived((sessions?.length ?? 0) - 1);

  async function load() {
    loadError = false;
    try {
      [email, sessions] = await Promise.all([backend.accountEmail(), backend.sessions()]);
    } catch {
      loadError = true;
    }
  }
  onMount(() => {
    void load();
    // A confirmation left open as the page goes counts as cancelled, so it can't reappear on the next visit.
    return () => identity.finish(null);
  });

  /** Runs an action that needs a fresh ticket: nothing happens if the user cancels the confirmation. */
  async function withTicket(action: string, run: (ticket: string) => Promise<void>): Promise<boolean> {
    try {
      const ticket = await identity.ticket(backend, action);
      if (ticket === null) return false;
      await run(ticket);
      return true;
    } catch (e) {
      toasts.show(accountError(e));
      return false;
    }
  }

  let busySession = $state<string | null>(null);
  async function logOut(s: AccountSession) {
    busySession = s.id;
    if (await withTicket(t.confirm.actions.logOut, (ticket) => backend.revokeSession(s.id, ticket))) {
      sessions = sessions?.filter((x) => x.id !== s.id) ?? null;
      toasts.show(t.loggedOut, 'info');
    }
    busySession = null;
  }
  async function logOutOthers() {
    busySession = 'others';
    if (await withTicket(t.confirm.actions.logOutOthers, (ticket) => backend.revokeOtherSessions(ticket))) {
      toasts.show(t.loggedOutOthers, 'info');
      sessions = await backend.sessions().catch(() => sessions);
    }
    busySession = null;
  }

  // ---------- the password and email dialogs ----------

  let dialog = $state<'password' | 'email' | null>(null);
  let current = $state('');
  let next = $state('');
  let repeat = $state('');
  let newEmail = $state('');
  let busy = $state(false);
  let error = $state<string | undefined>();

  function open(which: 'password' | 'email') {
    current = next = repeat = newEmail = '';
    error = undefined;
    dialog = which;
  }
  function close() {
    if (!busy) dialog = null;
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (busy) return;
    error = undefined;
    if (dialog === 'password') {
      if (next.length < 8) return void (error = t.errors.short);
      if (next !== repeat) return void (error = t.errors.mismatch);
    }
    busy = true;
    try {
      const which = dialog;
      // With TOTP on, Stoat wants a ticket made from a code as well as the current password.
      const ticket = await identity.ticketIfTotp(backend, which === 'password' ? t.confirm.actions.password : t.confirm.actions.email);
      if (ticket === null) return;
      if (which === 'password') {
        await backend.changePassword(current, next, ticket);
        toasts.show(t.passwordDialog.done, 'info');
      } else {
        await backend.changeEmail(newEmail.trim(), current, ticket);
        toasts.show(t.emailDialog.done(newEmail.trim()), 'info');
      }
      dialog = null;
    } catch (err) {
      error = accountError(err);
    } finally {
      busy = false;
    }
  }
</script>

<section aria-labelledby="account-email">
  <div class="row">
    <div class="text">
      <h2 class="label" id="account-email">{t.email}</h2>
      <span class="value">{email ?? (loadError ? '' : t.loading)}</span>
    </div>
    {#if canChangeEmail}<Button variant="secondary" size="sm" onclick={() => open('email')} disabled={email === null}>{t.changeEmail}</Button>{/if}
  </div>
  <div class="row">
    <div class="text">
      <h2 class="label">{t.password}</h2>
      <span class="help">{t.passwordHelp}</span>
    </div>
    <Button variant="secondary" size="sm" onclick={() => open('password')}>{t.changePassword}</Button>
  </div>
  {#if loadError}
    <p class="error" role="alert">{t.loadFailed}</p>
    <Button variant="secondary" size="sm" onclick={load}>{m.admin.retry}</Button>
  {/if}
</section>

<div class="separator"></div>

<section aria-labelledby="account-devices">
  <h2 id="account-devices">{t.devices}</h2>
  <p class="help">{t.devicesHelp}</p>
  {#if sessions}
    <ul class="sessions">
      {#each listed as s (s.id)}
        {@const self = s.id === app.sessionId}
        <li>
          <span class="name">{s.name}</span>
          {#if self}<span class="chip">{t.thisDevice}</span>{/if}
          <!-- Without knowing which session is this one, a single logout might be this browser's own. -->
          {#if known && !self}
            <Button variant="ghost" size="sm" busy={busySession === s.id} disabled={!!busySession && busySession !== s.id} aria-label={t.logOutDevice(s.name)} onclick={() => logOut(s)}>{t.logOut}</Button>
          {/if}
        </li>
      {/each}
    </ul>
    {#if !known}<p class="help" role="note">{t.unknownDevice}</p>{/if}
    {#if others > 0}
      <div><Button variant="danger" size="sm" busy={busySession === 'others'} disabled={!!busySession && busySession !== 'others'} onclick={logOutOthers}>{t.logOutOthers}</Button></div>
    {:else}
      <p class="help">{t.noOthers}</p>
    {/if}
  {:else if !loadError}
    <p class="help">{t.loading}</p>
  {/if}
</section>

<Dialog open={dialog !== null} title={dialog === 'email' ? t.emailDialog.title : t.passwordDialog.title} onclose={close}>
  <form id="account-change" onsubmit={submit}>
    {#if dialog === 'email'}
      <p>{t.emailDialog.help}</p>
      <TextField label={t.emailDialog.next} type="email" autocomplete="email" required bind:value={newEmail} disabled={busy} />
      <TextField label={t.emailDialog.current} type="password" autocomplete="current-password" required bind:value={current} disabled={busy} />
    {:else}
      <TextField label={t.passwordDialog.current} type="password" autocomplete="current-password" required bind:value={current} disabled={busy} />
      <TextField label={t.passwordDialog.next} type="password" autocomplete="new-password" minlength={8} required bind:value={next} disabled={busy} hint={t.passwordDialog.rules} />
      <TextField label={t.passwordDialog.repeat} type="password" autocomplete="new-password" minlength={8} required bind:value={repeat} disabled={busy} />
    {/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  </form>
  {#snippet actions()}
    <Button variant="ghost" onclick={close} disabled={busy}>{t.cancel}</Button>
    <Button type="submit" form="account-change" {busy}>{dialog === 'email' ? t.emailDialog.submit : t.passwordDialog.submit}</Button>
  {/snippet}
</Dialog>

<ConfirmIdentity />

<style>
  section { display: grid; gap: var(--space-5); }
  h2 { margin: 0; color: var(--text-strong); font: 700 var(--text-lg) var(--font-sans); }
  .label { margin: 0; color: var(--text-secondary); font: 700 var(--text-xs) var(--font-sans); letter-spacing: 0.02em; text-transform: uppercase; }
  .separator { height: 1px; margin: var(--space-8) 0; background: var(--border-default); }
  .row { display: flex; align-items: center; gap: var(--space-5); }
  .text { flex: 1; display: grid; gap: var(--space-2); min-width: 0; }
  .value { color: var(--text-strong); font: var(--text-md) var(--font-sans); overflow-wrap: anywhere; }
  .help { margin: 0; color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  .error { margin: 0; color: var(--danger); font: var(--text-sm) var(--font-sans); }
  .sessions { display: grid; gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
  .sessions li {
    display: flex; align-items: center; gap: var(--space-4); min-height: var(--row-dm); padding: var(--space-2) var(--space-4);
    border-radius: var(--radius-md); background: var(--surface-2);
  }
  .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-normal); font: 500 var(--text-md) var(--font-sans); }
  .chip { padding: 0 var(--space-3); border-radius: var(--radius-full); background: var(--accent-subtle); color: var(--text-strong); font: 700 var(--text-xs) var(--font-sans); }
  form { display: grid; gap: var(--space-5); }
  form p { margin: 0; }
</style>
