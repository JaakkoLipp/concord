<script lang="ts">
  /**
   * User settings, My account, two-factor authentication (M4.8 task 9): turn TOTP on with a secret shown as a QR
   * code and as text, confirmed with a code from it; view or regenerate the recovery codes; turn it off. Each step
   * that needs an MFA ticket gets a fresh one from identity.svelte.ts (m4.8-results.md probe 2). The QR generator
   * loads only on the setup step (m4.8-plan.md decision 1).
   */
  import { onMount } from 'svelte';
  import { Button, TextField } from '@concord/ui';
  import type { Backend, MfaStatus } from '@concord/domain';
  import { m } from '$lib/i18n/index.ts';
  import { toasts } from '$lib/view/toast.svelte.ts';
  import { accountError } from './accountErrors.ts';
  import { identity } from './identity.svelte.ts';
  import { otpauthUri, qrModules } from './qr.ts';

  let { backend, email }: { backend: Backend; email: string | null } = $props();
  const t = m.account.twoFactor;

  let status = $state<MfaStatus | null>(null);
  /** The secret while it is being set up, before a code from it turns it on. */
  let setup = $state<{ secret: string; qr: boolean[][] | null } | null>(null);
  let code = $state('');
  let codes = $state<string[] | null>(null);
  let busy = $state<'on' | 'enable' | 'codes' | 'regenerate' | 'off' | null>(null);
  let error = $state<string | undefined>();

  async function refresh() {
    status = await backend.mfaStatus().catch(() => status);
  }
  onMount(() => void refresh());

  /** One ticketed step: false if the user cancelled or it failed, with the failure shown as a toast. */
  async function step(which: NonNullable<typeof busy>, action: string, run: (ticket: string) => Promise<void>): Promise<boolean> {
    busy = which;
    try {
      const ticket = await identity.ticket(backend, action);
      if (ticket === null) return false;
      await run(ticket);
      return true;
    } catch (e) {
      toasts.show(accountError(e));
      return false;
    } finally {
      busy = null;
    }
  }

  async function start() {
    codes = null;
    await step('on', t.actions.on, async (ticket) => {
      const secret = await backend.totpSecret(ticket);
      code = '';
      error = undefined;
      setup = { secret, qr: null };
      const uri = otpauthUri(secret, email ?? '');
      const qr = await qrModules(uri).catch(() => null);
      if (setup?.secret === secret) setup = { secret, qr };
    });
  }

  async function enable(e: SubmitEvent) {
    e.preventDefault();
    if (!setup || busy) return;
    busy = 'enable';
    error = undefined;
    try {
      await backend.enableTotp(code.replace(/\s+/g, ''));
      setup = null;
      toasts.show(t.enabled, 'info');
      await refresh();
    } catch (err) {
      error = accountError(err);
    } finally {
      busy = null;
    }
  }

  // Before any were made the list is empty (probe 2), so viewing makes the first ten. A ticket works once, so it
  // goes to one of the two routes, never both.
  const viewCodes = () => step('codes', t.actions.codes, async (ticket) => {
    codes = status?.recovery ? await backend.recoveryCodes(ticket) : await regenerateWith(ticket);
  });
  const regenerate = () => step('regenerate', t.actions.regenerate, async (ticket) => {
    codes = await regenerateWith(ticket);
    toasts.show(t.regenerated, 'info');
  });
  async function regenerateWith(ticket: string): Promise<string[]> {
    const fresh = await backend.regenerateRecoveryCodes(ticket);
    await refresh();
    return fresh;
  }
  async function turnOff() {
    if (await step('off', t.actions.off, (ticket) => backend.disableTotp(ticket))) {
      codes = null;
      toasts.show(t.disabled, 'info');
      await refresh();
    }
  }

  async function copy() {
    if (!codes) return;
    await navigator.clipboard.writeText(codes.join('\n')).then(() => toasts.show(t.copied, 'info'), () => toasts.show(t.copyFailed));
  }

  /** The secret in groups of four, as authenticator apps show it for typing in. */
  const grouped = (s: string) => s.replace(/(.{4})/g, '$1 ').trim();
</script>

<section aria-labelledby="account-2fa">
  <h2 id="account-2fa">{t.heading}</h2>
  {#if !status}
    <p class="help">{m.account.loading}</p>
  {:else if setup}
    <p class="help">{t.setupHelp}</p>
    <div class="setup">
      {#if setup.qr}
        {@const n = setup.qr.length}
        <svg class="qr" viewBox="0 0 {n} {n}" role="img" aria-label={t.qrLabel} shape-rendering="crispEdges">
          <rect width={n} height={n} class="light" />
          {#each setup.qr as row, y (y)}
            {#each row as dark, x (x)}{#if dark}<rect {x} {y} width="1" height="1" class="dark" />{/if}{/each}
          {/each}
        </svg>
      {:else}
        <div class="qr placeholder" aria-hidden="true"></div>
      {/if}
      <div class="manual">
        <span class="label">{t.secret}</span>
        <code class="secret">{grouped(setup.secret)}</code>
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- an otpauth: link for an authenticator app on this device -->
        <a class="link" href={otpauthUri(setup.secret, email ?? '')}>{t.openApp}</a>
      </div>
    </div>
    <form class="confirm" onsubmit={enable}>
      <TextField label={t.code} inputmode="numeric" autocomplete="one-time-code" maxlength={7} required bind:value={code} disabled={busy === 'enable'} {error} />
      <div class="buttons">
        <Button variant="ghost" onclick={() => (setup = null)} disabled={busy === 'enable'}>{m.account.cancel}</Button>
        <Button type="submit" busy={busy === 'enable'}>{t.enable}</Button>
      </div>
    </form>
  {:else if status.totp}
    <p class="help">{t.onHelp}</p>
    <div class="buttons">
      <Button variant="secondary" size="sm" busy={busy === 'codes'} disabled={!!busy} onclick={viewCodes}>{t.viewCodes}</Button>
      <Button variant="secondary" size="sm" busy={busy === 'regenerate'} disabled={!!busy} onclick={regenerate}>{t.regenerate}</Button>
      <Button variant="danger" size="sm" busy={busy === 'off'} disabled={!!busy} onclick={turnOff}>{t.turnOff}</Button>
    </div>
    {#if !status.recovery && !codes}<p class="help" role="note">{t.noCodes}</p>{/if}
    {#if codes}
      <div class="codes">
        <p class="help">{t.codesHelp}</p>
        <ul aria-label={t.codesLabel}>{#each codes as c (c)}<li><code>{c}</code></li>{/each}</ul>
        <div class="buttons">
          <Button variant="secondary" size="sm" onclick={copy}>{t.copy}</Button>
          <Button variant="ghost" size="sm" onclick={() => (codes = null)}>{t.hideCodes}</Button>
        </div>
      </div>
    {/if}
  {:else}
    <p class="help">{t.offHelp}</p>
    <div><Button size="sm" busy={busy === 'on'} disabled={!!busy} onclick={start}>{t.turnOn}</Button></div>
  {/if}
</section>

<style>
  section { display: grid; gap: var(--space-5); }
  h2 { margin: 0; color: var(--text-strong); font: 700 var(--text-lg) var(--font-sans); }
  .help { margin: 0; color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  .label { color: var(--text-secondary); font: 700 var(--text-xs) var(--font-sans); letter-spacing: 0.02em; text-transform: uppercase; }
  .buttons { display: flex; flex-wrap: wrap; gap: var(--space-3); }
  .setup { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-6); }
  /* The quiet zone is in the modules, so the light ground runs to the rounded edge. */
  .qr { width: 10rem; height: 10rem; border-radius: var(--radius-md); background: var(--qr-light); }
  .qr .light { fill: var(--qr-light); }
  .qr .dark { fill: var(--qr-dark); }
  .placeholder { background: var(--surface-3); }
  .manual { display: grid; gap: var(--space-3); min-width: 0; }
  .secret { color: var(--text-strong); font: 500 var(--text-md) ui-monospace, monospace; overflow-wrap: anywhere; user-select: all; }
  .link { color: var(--link); font: var(--text-sm) var(--font-sans); }
  .confirm { display: grid; gap: var(--space-4); max-width: 20rem; }
  .codes { display: grid; gap: var(--space-4); padding: var(--space-5); border-radius: var(--radius-md); background: var(--surface-2); }
  .codes ul { display: grid; grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr)); gap: var(--space-3); margin: 0; padding: 0; list-style: none; }
  .codes code { color: var(--text-strong); font: 500 var(--text-md) ui-monospace, monospace; }
</style>
