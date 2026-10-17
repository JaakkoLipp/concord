<script lang="ts">
  /**
   * Server invites on request, beside the beta invitations. `invite`: a member asks for an invite link to one of
   * their servers and an admin approves it; a moderator who may invite there makes the link at once. `review`: an
   * admin's queue. The invite itself is made by the approving person's own session and its code goes to the
   * layer, which never calls Stoat for it (serverInvites.ts). Stoat can't limit an invite's uses: one link, one person.
   */
  import { Button, TextField } from '@concord/ui';
  import { Permission, type ServerInviteRequest, type Session } from '@concord/domain';
  import { BackendError } from '@concord/domain/errors';
  import { resolve } from '$app/paths';
  import { m } from '$lib/i18n/index.ts';
  import { app } from '$lib/session/app.svelte.ts';
  import { shortDate } from '$lib/markdown/time.ts';
  import { orderedServers } from '$lib/view/channels.ts';
  import { channelsWith } from '$lib/view/admin.ts';
  import { toasts } from '$lib/view/toast.svelte.ts';

  let { session, mode }: { session: Session; mode: 'invite' | 'review' } = $props();
  const review = $derived(mode === 'review');
  const privileged = $derived(app.layerMe?.gates.admin === true || app.layerMe?.gates.serverCreator === true);
  const servers = $derived(orderedServers(session.store));
  let rows = $state<ServerInviteRequest[] | null>(null);
  let failed = $state(false);
  let server = $state('');
  let note = $state('');
  let busy = $state(false);
  let working = $state<string | null>(null);

  const chosen = $derived(server && session.store.servers.has(server) ? server : (servers[0]?.id ?? ''));
  const pending = $derived((rows ?? []).filter((r) => r.status === 'pending'));
  const serverName = (id: string) => session.store.servers.get(id)?.name ?? id;
  const askerName = (id: string) => session.store.users.get(id)?.username ?? id;
  const inviteChannel = (id: string) => channelsWith(session.store, id, Permission.InviteOthers)[0];

  async function load(): Promise<void> {
    const layer = app.layer;
    if (!layer) return;
    try {
      rows = await layer.serverInvites(review);
      failed = false;
    } catch {
      failed = true;
    }
  }

  $effect(() => {
    void load();
  });

  const link = (code: string) => `${location.origin}${resolve('/(app)/app/invite/[code]', { code })}`;

  async function copy(code: string, message: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(link(code));
      toasts.show(message, 'info');
    } catch {
      toasts.show(m.serverInvites.errors.copy);
    }
  }

  /** A new Stoat invite in the server, made by this account. */
  async function makeCode(id: string): Promise<string | null> {
    const channel = inviteChannel(id);
    return channel ? (await session.admin.createInvite(channel)).code : null;
  }

  async function ask(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    const layer = app.layer;
    if (!layer || !chosen || busy) return;
    busy = true;
    try {
      // A moderator who may invite there skips review with a link made on the spot.
      const code = privileged ? await makeCode(chosen) : null;
      const row = await layer.requestServerInvite(chosen, note.trim(), code ?? undefined);
      note = '';
      if (row.code) await copy(row.code, m.serverInvites.created);
      else toasts.show(m.serverInvites.sent, 'info');
      await load();
    } catch (err) {
      toasts.show(err instanceof BackendError && err.kind === 'InvitationLimit' ? m.serverInvites.errors.limit : m.serverInvites.errors.request);
    } finally {
      busy = false;
    }
  }

  async function decide(row: ServerInviteRequest, approve: boolean): Promise<void> {
    const layer = app.layer;
    if (!layer || working) return;
    working = row.id;
    try {
      let code: string | undefined;
      if (approve) {
        const made = await makeCode(row.server);
        if (!made) {
          toasts.show(m.serverInvites.errors.cantInvite);
          return;
        }
        code = made;
      }
      await layer.reviewServerInvite(row.id, approve ? 'approve' : 'decline', code);
      await load();
    } catch {
      toasts.show(m.serverInvites.errors.change);
    } finally {
      working = null;
    }
  }
</script>

{#snippet request(row: ServerInviteRequest)}
  <li class="row">
    <span class="text">
      <span class="name">{serverName(row.server)}{#if row.note} · {row.note}{/if}</span>
      <span class="sub">
        <span class="status s-{row.status}">{m.serverInvites.statuses[row.status]}</span>
        {#if review} · {m.serverInvites.by(askerName(row.requestedBy))}{/if} · {shortDate(new Date(row.createdAt))}
      </span>
    </span>
    <span class="actions">
      {#if row.status === 'pending' && review}
        <Button size="sm" variant="secondary" busy={working === row.id} onclick={() => void decide(row, true)}>{m.serverInvites.approve}</Button>
        <Button size="sm" variant="ghost" disabled={working === row.id} onclick={() => void decide(row, false)}>{m.serverInvites.decline}</Button>
      {:else if row.status === 'approved' && row.code}
        <Button size="sm" variant="secondary" onclick={() => void copy(row.code!, m.serverInvites.copied)}>{m.serverInvites.copy}</Button>
      {/if}
    </span>
  </li>
{/snippet}

{#if review}
  <h2 class="heading" id="server-review">{m.serverInvites.review}</h2>
  {#if failed}
    <p class="none">{m.serverInvites.errors.load}</p>
  {:else if rows !== null && pending.length}
    <ul aria-labelledby="server-review">{#each pending as row (row.id)}{@render request(row)}{/each}</ul>
  {:else if rows !== null}
    <p class="none">{m.serverInvites.reviewEmpty}</p>
  {/if}
{:else}
  <section class="new" aria-labelledby="server-new">
    <h2 id="server-new">{m.serverInvites.title}</h2>
    {#if servers.length}
      <p class="help">{privileged ? m.serverInvites.helpDirect : m.serverInvites.help}</p>
      <form onsubmit={ask}>
        <label class="field">
          <span class="label">{m.serverInvites.server}</span>
          <select value={chosen} onchange={(e) => (server = e.currentTarget.value)} disabled={busy}>
            {#each servers as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
          </select>
        </label>
        <TextField label={m.serverInvites.note} placeholder={m.serverInvites.notePlaceholder} maxlength={80} bind:value={note} disabled={busy}>
          {#snippet trailing()}
            <Button type="submit" size="sm" {busy}>{privileged && inviteChannel(chosen) ? m.serverInvites.create : m.serverInvites.request}</Button>
          {/snippet}
        </TextField>
      </form>
    {:else}
      <p class="help">{m.serverInvites.noServers}</p>
    {/if}
  </section>
  {#if rows?.length}
    <h2 class="heading" id="server-mine">{m.serverInvites.mine}</h2>
    <ul aria-labelledby="server-mine">{#each rows as row (row.id)}{@render request(row)}{/each}</ul>
  {/if}
{/if}

<style>
  .new { margin-top: var(--space-8); }
  .new h2 { margin: 0 0 var(--space-2); color: var(--text-strong); font: 700 var(--text-lg) var(--font-sans); }
  .help { margin: 0 0 var(--space-4); color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  form { display: grid; gap: var(--space-4); }
  .field { display: grid; gap: var(--space-3); }
  .label { color: var(--text-secondary); font: 700 var(--text-xs) var(--font-sans); letter-spacing: 0.02em; text-transform: uppercase; }
  select { min-height: var(--control-h); padding: 0 var(--space-4); background: var(--surface-0); color: var(--text-strong); border: 1px solid var(--border-control); border-radius: var(--radius-md); font: var(--text-md) var(--font-sans); min-width: 0; text-overflow: ellipsis; }
  select:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .heading { margin: var(--space-8) 0 var(--space-3); color: var(--text-secondary); font: 500 var(--text-xs) var(--font-sans); letter-spacing: 0.02em; text-transform: uppercase; }
  .none { margin: 0; color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  ul { margin: 0; padding: 0; list-style: none; }
  .row { display: flex; align-items: center; gap: var(--space-4); min-height: 3.75rem; padding: 0 var(--space-3); border-top: 1px solid var(--border-subtle); border-radius: var(--radius-md); }
  .row:hover { background: var(--hover-overlay); border-top-color: transparent; }
  .text { display: grid; flex: 1; min-width: 0; }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-strong); font: 500 var(--text-md) var(--font-sans); }
  .sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  .status { font-weight: 500; }
  .s-pending { color: var(--text-muted); }
  .s-approved { color: var(--status-online); }
  .s-declined { color: var(--danger); }
  .actions { display: flex; gap: var(--space-3); flex: none; }
</style>
