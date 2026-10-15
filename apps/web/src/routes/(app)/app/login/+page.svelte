<script lang="ts">
  import Logo from '$lib/brand/Logo.svelte';
  import { Button } from '@concord/ui';
  import { StoatError } from '@concord/stoat';
  import { m } from '$lib/i18n/index.ts';
  import { app, backend } from '$lib/session/app.svelte.ts';

  type Step = { kind: 'credentials' } | { kind: 'mfa'; ticket: string; methods: string[]; recovery: boolean } | { kind: 'onboard'; token: string };

  let step = $state<Step>({ kind: 'credentials' });
  let email = $state('');
  let password = $state('');
  let code = $state('');
  let username = $state('');
  let busy = $state(false);
  let error = $state('');

  function explain(e: unknown): string {
    if (e instanceof StoatError) {
      if (e.status === 429) return m.login.errors.rateLimited;
      switch (e.kind) {
        case 'InvalidCredentials': return m.login.errors.credentials;
        case 'UnverifiedAccount': return m.login.errors.unverified;
        case 'InvalidToken': return step.kind === 'mfa' ? m.login.errors.code : m.login.errors.ticket;
        case 'UsernameTaken': case 'InvalidUsername': case 'FailedValidation': return m.login.errors.username;
      }
      return m.login.errors.unknown;
    }
    return e instanceof TypeError ? m.login.errors.network : m.login.errors.unknown;
  }

  async function finish(token: string) {
    backend.setToken(token);
    if (await backend.onboarding()) {
      step = { kind: 'onboard', token };
      return;
    }
    await app.signIn(token);
  }

  async function attempt(fn: () => Promise<void>) {
    if (busy) return;
    busy = true;
    error = '';
    try {
      await fn();
    } catch (e) {
      error = explain(e);
      // An expired or exhausted ticket can't be retried; start over.
      if (step.kind === 'mfa' && e instanceof StoatError && e.kind === 'InvalidToken' && !e.body) step = { kind: 'credentials' };
    } finally {
      busy = false;
    }
  }

  const submitCredentials = (e: SubmitEvent) => {
    e.preventDefault();
    void attempt(async () => {
      const r = await backend.login(email.trim(), password);
      if (r.kind === 'disabled') throw new Error(m.login.errors.disabled);
      if (r.kind === 'mfa') {
        step = { kind: 'mfa', ticket: r.ticket, methods: r.methods, recovery: !r.methods.includes('Totp') };
        code = '';
        return;
      }
      await finish(r.token);
    });
  };

  const submitCode = (e: SubmitEvent) => {
    e.preventDefault();
    if (step.kind !== 'mfa') return;
    const s = step;
    void attempt(async () => {
      const value = code.replace(/\s+/g, '');
      const r = await backend.loginMfa(s.ticket, s.recovery ? { recovery: value } : { totp: value });
      if (r.kind !== 'session') throw new Error(m.login.errors.unknown);
      await finish(r.token);
    });
  };

  const submitUsername = (e: SubmitEvent) => {
    e.preventDefault();
    if (step.kind !== 'onboard') return;
    const token = step.token;
    void attempt(async () => {
      await backend.completeOnboarding(username.trim());
      await app.signIn(token);
    });
  };
</script>

<main class="page">
  <div class="brand"><Logo size="var(--avatar-md)" /><span>{m.app.name}</span></div>
  <div class="card">
    {#if step.kind === 'credentials'}
      <h1>{m.login.title}</h1>
      <p class="sub">{m.login.subtitle}</p>
      <form onsubmit={submitCredentials}>
        <label>
          <span>{m.login.email}</span>
          <input type="email" autocomplete="username" required bind:value={email} disabled={busy} />
        </label>
        <label>
          <span>{m.login.password}</span>
          <input type="password" autocomplete="current-password" required bind:value={password} disabled={busy} />
        </label>
        {#if error}<p class="error" role="alert">{error}</p>{/if}
        <Button type="submit" wide {busy}>{m.login.submit}</Button>
      </form>
    {:else if step.kind === 'mfa'}
      <h1>{m.login.mfaTitle}</h1>
      <p class="sub">{step.recovery ? m.login.mfaRecoveryHelp : m.login.mfaTotpHelp}</p>
      <form onsubmit={submitCode}>
        <label>
          <span>{step.recovery ? m.login.recoveryCode : m.login.totpCode}</span>
          {#if step.recovery}
            <input autocomplete="off" spellcheck="false" required bind:value={code} disabled={busy} />
          {:else}
            <input inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]*" maxlength="7" required bind:value={code} disabled={busy} />
          {/if}
        </label>
        {#if error}<p class="error" role="alert">{error}</p>{/if}
        <Button type="submit" wide {busy}>{m.login.verify}</Button>
      </form>
      {#if step.methods.includes('Totp') && step.methods.includes('Recovery')}
        <button class="link" type="button" onclick={() => { if (step.kind === 'mfa') { step = { ...step, recovery: !step.recovery }; code = ''; error = ''; } }}>
          {step.recovery ? m.login.useTotp : m.login.useRecovery}
        </button>
      {/if}
      <button class="link" type="button" onclick={() => { step = { kind: 'credentials' }; error = ''; }}>{m.common.back}</button>
    {:else}
      <h1>{m.login.onboardTitle}</h1>
      <p class="sub">{m.login.onboardHelp}</p>
      <form onsubmit={submitUsername}>
        <label>
          <span>{m.login.username}</span>
          <input autocomplete="username" spellcheck="false" required minlength="2" maxlength="32" pattern={'[\\p{L}\\p{N}_.\\-]+'} bind:value={username} disabled={busy} />
          <small>{m.login.usernameRules}</small>
        </label>
        {#if error}<p class="error" role="alert">{error}</p>{/if}
        <Button type="submit" wide {busy}>{m.login.onboardSubmit}</Button>
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
  .link {
    display: block; margin: var(--space-5) auto 0; padding: var(--space-2);
    background: none; border: 0; color: var(--link); font: 500 var(--text-sm) var(--font-sans);
  }
  @media (hover: hover) { .link:hover { text-decoration: underline; } }
</style>
