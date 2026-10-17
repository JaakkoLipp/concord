<script lang="ts">
  /**
   * The closed-beta invitation link: the invited person sets their email and password, and the account is
   * created through our own layer (the only path that may create accounts). Reached signed out, like the
   * welcome link; afterwards they log in, and still need a server invite to join a server.
   */
  import Logo from '$lib/brand/Logo.svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { Button } from '@concord/ui';
  import { m } from '$lib/i18n/index.ts';

  let email = $state('');
  let password = $state('');
  let confirm = $state('');
  let busy = $state(false);
  let error = $state('');
  let done = $state(false);

  const token = $derived(page.params.token ?? '');

  /** The endpoint answers `{ type }` for refusals (layer/http.ts): show the matching sentence. */
  function explain(kind: string | undefined): string {
    switch (kind) {
      case 'InvalidInvitation': return m.betaRedeem.errors.invalid;
      case 'InvalidEmail': return m.betaRedeem.errors.email;
      case 'ShortPassword': return m.betaRedeem.errors.short;
      case 'CompromisedPassword': return m.betaRedeem.errors.compromised;
      case 'AccountExists': return m.betaRedeem.errors.exists;
      case 'RateLimited': return m.betaRedeem.errors.rate;
      default: return m.betaRedeem.errors.unknown;
    }
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (busy) return;
    error = '';
    if (password !== confirm) return void (error = m.betaRedeem.errors.mismatch);
    if (password.length < 8) return void (error = m.betaRedeem.errors.short);
    busy = true;
    try {
      const res = await fetch('/app/api/v1/beta/redeem', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, email: email.trim(), password }),
      });
      if (res.ok) {
        done = true;
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { type?: string };
      error = explain(body.type);
    } catch {
      error = m.betaRedeem.errors.network;
    } finally {
      busy = false;
    }
  }

  const logIn = () => goto(resolve('/app/login'), { replaceState: true });
</script>

<main class="page">
  <div class="brand"><Logo size="var(--avatar-md)" /><span>{m.app.name}</span></div>
  <div class="card">
    {#if done}
      <h1>{m.betaRedeem.doneTitle}</h1>
      <p class="sub">{m.betaRedeem.doneHelp}</p>
      <Button wide onclick={logIn}>{m.betaRedeem.logIn}</Button>
    {:else}
      <h1>{m.betaRedeem.title}</h1>
      <p class="sub">{m.betaRedeem.help}</p>
      <form onsubmit={submit}>
        <label>
          <span>{m.betaRedeem.email}</span>
          <input type="email" autocomplete="email" required bind:value={email} disabled={busy} />
        </label>
        <label>
          <span>{m.betaRedeem.password}</span>
          <input type="password" autocomplete="new-password" minlength="8" required bind:value={password} disabled={busy} />
          <small>{m.betaRedeem.rules}</small>
        </label>
        <label>
          <span>{m.betaRedeem.confirm}</span>
          <input type="password" autocomplete="new-password" minlength="8" required bind:value={confirm} disabled={busy} />
        </label>
        {#if error}<p class="error" role="alert">{error}</p>{/if}
        <Button type="submit" wide {busy}>{m.betaRedeem.submit}</Button>
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
