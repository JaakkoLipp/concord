<script lang="ts">
  import Logo from '$lib/brand/Logo.svelte';
  // The welcome link (m3-plan.md task 2): there is no email in M3, so Jaakko sends each person a one-time link
  // made by deploy/account-link.sh. It sets their password; then they log in and go on to the invite, if any.
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { Button } from '@concord/ui';
  import { StoatError } from '@concord/stoat';
  import { m } from '$lib/i18n/index.ts';
  import { backend } from '$lib/session/app.svelte.ts';

  let password = $state('');
  let confirm = $state('');
  let busy = $state(false);
  let error = $state('');
  let done = $state(false);

  const invite = $derived(page.url.searchParams.get('invite'));

  function explain(e: unknown): string {
    if (e instanceof StoatError) {
      switch (e.kind) {
        case 'ShortPassword': return m.welcome.errors.short;
        case 'CompromisedPassword': return m.welcome.errors.compromised;
        case 'InvalidToken': return m.welcome.errors.invalid;
      }
      return e.status === 401 || e.status === 404 ? m.welcome.errors.invalid : m.welcome.errors.unknown;
    }
    return e instanceof TypeError ? m.welcome.errors.network : m.welcome.errors.unknown;
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (busy) return;
    error = '';
    if (password !== confirm) return void (error = m.welcome.errors.mismatch);
    if (password.length < 8) return void (error = m.welcome.errors.short);
    busy = true;
    try {
      await backend.setPasswordWithToken(page.params.token ?? '', password);
      done = true;
    } catch (err) {
      error = explain(err);
    } finally {
      busy = false;
    }
  }

  // Login sends a new account through choosing a username, then on to `next`.
  const next = $derived(invite && /^[A-Za-z0-9]+$/.test(invite) ? `/app/invite/${invite}` : null);
  // eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve() plus a query string
  const logIn = () => goto(`${resolve('/app/login')}${next ? `?next=${encodeURIComponent(next)}` : ''}`, { replaceState: true });
</script>

<main class="page">
  <div class="brand"><Logo size="var(--avatar-md)" /><span>{m.app.name}</span></div>
  <div class="card">
    {#if done}
      <h1>{m.welcome.doneTitle}</h1>
      <p class="sub">{m.welcome.doneHelp}</p>
      <Button wide onclick={logIn}>{m.welcome.logIn}</Button>
    {:else}
      <h1>{m.welcome.title}</h1>
      <p class="sub">{m.welcome.help}</p>
      <form onsubmit={submit}>
        <label>
          <span>{m.welcome.password}</span>
          <input type="password" autocomplete="new-password" minlength="8" required bind:value={password} disabled={busy} />
          <small>{m.welcome.rules}</small>
        </label>
        <label>
          <span>{m.welcome.confirm}</span>
          <input type="password" autocomplete="new-password" minlength="8" required bind:value={confirm} disabled={busy} />
        </label>
        {#if error}<p class="error" role="alert">{error}</p>{/if}
        <Button type="submit" wide {busy}>{m.welcome.submit}</Button>
      </form>
    {/if}
  </div>
</main>

<style>
  .page { display: grid; place-items: center; align-content: center; gap: var(--space-6); min-height: 100dvh; padding: var(--space-5); overflow: auto; }
  .brand { display: flex; align-items: center; gap: var(--space-3); color: var(--text-strong); font: 700 var(--text-xl) var(--font-sans); }
  .card {
    width: min(100%, 30rem); padding: var(--space-8);
    background: var(--surface-1); border: 1px solid var(--border-default); border-radius: var(--radius-xl);
  }
  h1 { margin: 0; text-align: center; color: var(--text-strong); font: 700 var(--text-xl) var(--font-sans); }
  .sub { margin: var(--space-3) 0 var(--space-7); text-align: center; color: var(--text-secondary); font: var(--text-md) var(--font-sans); }
  form { display: grid; gap: var(--space-6); }
  label { display: grid; gap: var(--space-3); }
  label span {
    color: var(--text-secondary); font: 700 var(--text-xs) var(--font-sans); letter-spacing: 0.02em; text-transform: uppercase;
  }
  input {
    min-height: var(--control-h); padding: 0 var(--space-4);
    background: var(--surface-0); color: var(--text-strong);
    border: 1px solid var(--border-control); border-radius: var(--radius-md);
  }
  input:focus-visible { outline-offset: 0; }
  input:disabled { opacity: 0.6; }
  small { color: var(--text-secondary); font: var(--text-xs) var(--font-sans); }
  .error { margin: 0; color: var(--danger); font: var(--text-sm) var(--font-sans); }
</style>
