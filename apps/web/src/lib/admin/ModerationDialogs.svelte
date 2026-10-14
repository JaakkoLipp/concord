<script lang="ts">
  /**
   * Kick, ban and invite (m2c-plan.md task 6). The invite dialog offers only channels where this account may
   * invite, the current one first, and shows the link once made.
   */
  import { Button, Dialog, TextField } from '@concord/ui';
  import { Permission, type Session } from '@concord/domain';
  import { m } from '$lib/i18n/index.ts';
  import { channelsWith } from '$lib/view/admin.ts';
  import { toasts } from '$lib/view/toast.svelte.ts';
  import { adminDialogs } from './dialogs.svelte.ts';

  let { session }: { session: Session } = $props();
  const store = $derived(session.store);
  const d = $derived(adminDialogs.current);
  const member = $derived(d && (d.kind === 'kick' || d.kind === 'ban') ? d : null);
  const invite = $derived(d?.kind === 'invite' ? d : null);
  const name = $derived(member ? store.displayName(member.user, member.server) : '');
  const inviteChannels = $derived(invite ? channelsWith(store, invite.server, Permission.InviteOthers) : []);

  let reason = $state('');
  let channel = $state('');
  let link = $state('');
  let busy = $state(false);
  let filledFor: unknown = null;
  $effect(() => {
    if (d === filledFor) return;
    filledFor = d;
    reason = '';
    link = '';
    if (d?.kind === 'invite') channel = d.channel && inviteChannels.includes(d.channel) ? d.channel : (inviteChannels[0] ?? '');
  });

  const close = () => adminDialogs.close();

  async function act() {
    const x = member;
    if (!x || busy) return;
    busy = true;
    try {
      if (x.kind === 'kick') await session.admin.kick(x.server, x.user);
      else await session.admin.ban(x.server, x.user, reason.trim() || undefined);
      adminDialogs.done(x);
    } catch {
      toasts.show(x.kind === 'kick' ? m.admin.kick.failed : m.admin.ban.failed);
    } finally {
      busy = false;
    }
  }

  async function createInvite() {
    if (!channel || busy) return;
    busy = true;
    try {
      const inv = await session.admin.createInvite(channel);
      link = `${location.origin}/invite/${inv.code}`;
    } catch {
      toasts.show(m.admin.invite.failed);
    } finally {
      busy = false;
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toasts.show(m.admin.invite.copied, 'info');
    } catch {
      // Clipboard blocked: the link is selectable.
    }
  }
</script>

<Dialog open={!!member} title={member ? (member.kind === 'kick' ? m.admin.kick.title(name) : m.admin.ban.title(name)) : ''} onclose={close}>
  {#if member}
    <p>{member.kind === 'kick' ? m.admin.kick.body : m.admin.ban.body}</p>
    {#if member.kind === 'ban'}
      <div class="group">
        <label class="label" for="ban-reason">{m.admin.ban.reason}</label>
        <textarea id="ban-reason" rows="3" bind:value={reason} maxlength={1024} aria-describedby="ban-reason-note"></textarea>
        <p class="note" id="ban-reason-note">{m.admin.ban.reasonHint}</p>
      </div>
    {/if}
  {/if}
  {#snippet actions()}
    <Button variant="ghost" onclick={close}>{m.admin.cancel}</Button>
    <Button variant="danger" {busy} onclick={act}>{member?.kind === 'ban' ? m.admin.ban.confirm : m.admin.kick.confirm}</Button>
  {/snippet}
</Dialog>

<Dialog open={!!invite} title={invite ? m.admin.invite.title(store.servers.get(invite.server)?.name ?? '') : ''} onclose={close}>
  {#if invite}
    <div class="form">
      <label class="group">
        <span class="label">{m.admin.invite.channel}</span>
        <select bind:value={channel} onchange={() => (link = '')}>
          {#each inviteChannels as id (id)}
            {@const c = store.channels.get(id)}
            <option value={id}>#{c?.kind === 'text' ? c.name : ''}</option>
          {/each}
        </select>
      </label>
      {#if link}
        <TextField label={m.admin.invite.link} value={link} readonly onfocus={(e) => e.currentTarget.select()}>
          {#snippet trailing()}<Button size="sm" onclick={copy}>{m.admin.invite.copy}</Button>{/snippet}
        </TextField>
        <p class="note">{m.admin.invite.body}</p>
      {/if}
    </div>
  {/if}
  {#snippet actions()}
    {#if link}
      <Button onclick={close}>{m.admin.invite.done}</Button>
    {:else}
      <Button variant="ghost" onclick={close}>{m.admin.cancel}</Button>
      <Button {busy} disabled={!channel} onclick={createInvite}>{m.admin.invite.create}</Button>
    {/if}
  {/snippet}
</Dialog>

<style>
  .form { display: grid; gap: var(--space-5); }
  .group { display: grid; gap: var(--space-2); margin-top: var(--space-4); }
  .form .group { margin-top: 0; }
  .label { color: var(--text-secondary); font: 700 var(--text-xs) var(--font-sans); letter-spacing: 0.02em; text-transform: uppercase; }
  textarea, select { padding: var(--space-3) var(--space-4); background: var(--surface-0); color: var(--text-strong); border: 1px solid var(--border-control); border-radius: var(--radius-md); font: var(--text-md) var(--font-sans); }
  textarea { resize: vertical; }
  textarea:focus-visible, select:focus-visible { outline: none; border-color: var(--accent); }
  .note { margin: 0; color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
</style>
