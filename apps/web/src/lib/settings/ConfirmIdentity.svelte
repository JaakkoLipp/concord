<script lang="ts">
  /**
   * The "confirm it's you" dialog for identity.svelte.ts: the password with TOTP off, else an authenticator code,
   * or a recovery code when the account has them. A wrong answer stays in the dialog to try again.
   */
  import { Button, Dialog, TextField } from '@concord/ui';
  import { m } from '$lib/i18n/index.ts';
  import { accountError } from './accountErrors.ts';
  import { identity } from './identity.svelte.ts';

  const request = $derived(identity.request);
  const byPassword = $derived(!!request && !request.methods.includes('Totp') && request.methods.includes('Password'));
  const canRecover = $derived(!!request?.methods.includes('Recovery'));
  let recovery = $state(false);
  let value = $state('');
  let busy = $state(false);
  let error = $state<string | undefined>();
  const t = m.account.confirm;

  // A fresh form for each request.
  $effect(() => {
    if (!request) return;
    recovery = !request.methods.includes('Totp') && !request.methods.includes('Password');
    value = '';
    error = undefined;
  });

  function cancel() {
    if (!busy) identity.finish(null);
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    const r = request;
    if (!r || busy || !value.trim()) return;
    busy = true;
    error = undefined;
    try {
      const code = value.replace(/\s+/g, '');
      const ticket = await r.backend.mfaTicket(byPassword ? { password: value } : recovery ? { recovery: code } : { totp: code });
      identity.finish(ticket);
    } catch (err) {
      error = accountError(err);
    } finally {
      busy = false;
    }
  }

  function toggle() {
    recovery = !recovery;
    value = '';
    error = undefined;
  }
</script>

<Dialog open={!!request} title={t.title} onclose={cancel}>
  {#if request}
    <form id="confirm-identity" onsubmit={submit}>
      <p>{byPassword ? t.passwordHelp(request.action) : recovery ? t.recoveryHelp(request.action) : t.totpHelp(request.action)}</p>
      {#if byPassword}
        <TextField label={t.password} type="password" autocomplete="current-password" required bind:value disabled={busy} {error} />
      {:else if recovery}
        <TextField label={t.recoveryCode} autocomplete="off" spellcheck="false" required bind:value disabled={busy} {error} />
      {:else}
        <TextField label={t.totpCode} inputmode="numeric" autocomplete="one-time-code" maxlength={7} required bind:value disabled={busy} {error} />
      {/if}
      {#if !byPassword && canRecover && request.methods.includes('Totp')}
        <button type="button" class="link" onclick={toggle}>{recovery ? t.useTotp : t.useRecovery}</button>
      {/if}
    </form>
  {/if}
  {#snippet actions()}
    <Button variant="ghost" onclick={cancel} disabled={busy}>{m.account.cancel}</Button>
    <Button type="submit" form="confirm-identity" {busy}>{t.submit}</Button>
  {/snippet}
</Dialog>

<style>
  form { display: grid; gap: var(--space-4); }
  form p { margin: 0; }
  .link { justify-self: start; padding: 0; border: 0; background: none; color: var(--link); font: var(--text-sm) var(--font-sans); cursor: pointer; }
  @media (hover: hover) { .link:hover { text-decoration: underline; } }
  .link:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
