<script lang="ts">
  /**
   * Kick, ban, timeout and invite (m2c-plan.md task 6, m4.7-plan.md task 6). Kick, ban and timeout take a reason for the
   * audit log; a ban can also delete the person's recent messages, for server admins only. The invite dialog offers only
   * channels where this account may invite, the current one first, and shows the link once made. Reporting a message or a
   * person (m4.7-plan.md task 9) goes through Concord's layer.
   */
  import { Button, Dialog, TextField } from '@concord/ui';
  import { BackendError, Permission, type ReportReason, type Session } from '@concord/domain';
  import { app } from '$lib/session/app.svelte.ts';
  import { m } from '$lib/i18n/index.ts';
  import { channelsWith, isServerAdmin } from '$lib/view/admin.ts';
  import { toasts } from '$lib/view/toast.svelte.ts';
  import { adminDialogs, type AdminDialog } from './dialogs.svelte.ts';

  let { session }: { session: Session } = $props();
  const store = $derived(session.store);
  const d = $derived(adminDialogs.current);
  type MemberDialog = Extract<AdminDialog, { kind: 'kick' | 'ban' | 'timeout' }>;
  const isMember = (x: AdminDialog | null): x is MemberDialog => !!x && (x.kind === 'kick' || x.kind === 'ban' || x.kind === 'timeout');
  const member = $derived(isMember(d) ? d : null);
  const name = $derived(member ? store.displayName(member.user, member.server) : '');
  /** A ban's message deletion, in seconds (m4.7-plan.md task 6). Stoat takes up to 7 days. */
  const DELETIONS = [0, 60 * 60, 24 * 60 * 60, 7 * 24 * 60 * 60];
  const canDelete = $derived(member?.kind === 'ban' && isServerAdmin(store, member.server));
  const title = $derived(!member ? '' : member.kind === 'timeout' ? m.moderation.timeoutTitle(name, member.seconds) : member.kind === 'kick' ? m.admin.kick.title(name) : m.admin.ban.title(name));
  const body = $derived(!member ? '' : member.kind === 'timeout' ? m.moderation.timeoutBody : member.kind === 'kick' ? m.admin.kick.body : m.admin.ban.body);
  const confirmLabel = $derived(member?.kind === 'ban' ? m.admin.ban.confirm : member?.kind === 'timeout' ? m.moderation.timeoutConfirm : m.admin.kick.confirm);
  const invite = $derived(d?.kind === 'invite' ? d : null);
  const inviteChannels = $derived(invite ? channelsWith(store, invite.server, Permission.InviteOthers) : []);
  const report = $derived(d?.kind === 'report' ? d : null);
  const REASONS: ReportReason[] = ['spam', 'harassment', 'hate', 'sexual', 'violence', 'other'];
  let why = $state<ReportReason | ''>('');
  let notes = $state('');

  let reason = $state('');
  let deletion = $state(0);
  let channel = $state('');
  let link = $state('');
  let busy = $state(false);
  let filledFor: unknown = null;
  $effect(() => {
    if (d === filledFor) return;
    filledFor = d;
    reason = '';
    deletion = 0;
    why = '';
    notes = '';
    link = '';
    if (d?.kind === 'invite') channel = d.channel && inviteChannels.includes(d.channel) ? d.channel : (inviteChannels[0] ?? '');
  });

  const close = () => adminDialogs.close();

  async function act() {
    const x = member;
    if (!x || busy) return;
    busy = true;
    const why = reason.trim() || undefined;
    try {
      if (x.kind === 'timeout') await session.admin.editMember(x.server, x.user, { timeout: new Date(Date.now() + x.seconds * 1000).toISOString() }, why);
      else if (x.kind === 'kick') await session.admin.kick(x.server, x.user, why);
      else await session.admin.ban(x.server, x.user, why, canDelete ? deletion : 0);
      adminDialogs.done(x);
    } catch {
      toasts.show(x.kind === 'kick' ? m.admin.kick.failed : x.kind === 'ban' ? m.admin.ban.failed : m.moderation.timeoutFailed);
    } finally {
      busy = false;
    }
  }

  async function sendReport() {
    const x = report;
    const layer = app.layer;
    if (!x || !layer || !why || busy) return;
    busy = true;
    try {
      await layer.report(x.target, why, notes.trim());
      adminDialogs.done(x);
      toasts.show(m.reports.sent, 'info');
    } catch (e) {
      toasts.show(e instanceof BackendError && e.kind === 'ReportLimit' ? m.reports.limit : m.reports.failed);
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

<Dialog open={!!member} {title} onclose={close}>
  {#if member}
    <p>{body}</p>
    {#if canDelete}
      <div class="group">
        <label class="label" for="ban-delete">{m.admin.ban.deleteMessages}</label>
        <select id="ban-delete" bind:value={deletion} aria-describedby="ban-delete-note">
          {#each DELETIONS as s (s)}<option value={s}>{s ? m.admin.ban.deleteFor(s) : m.admin.ban.deleteNone}</option>{/each}
        </select>
        <p class="note" id="ban-delete-note">{m.admin.ban.deleteHint}</p>
      </div>
    {/if}
    <div class="group">
      <label class="label" for="moderation-reason">{member.kind === 'ban' ? m.admin.ban.reason : m.moderation.reason}</label>
      <textarea id="moderation-reason" rows="3" bind:value={reason} maxlength={1024} aria-describedby="moderation-reason-note"></textarea>
      <p class="note" id="moderation-reason-note">{member.kind === 'ban' ? m.admin.ban.reasonHint : m.moderation.reasonHint}</p>
    </div>
  {/if}
  {#snippet actions()}
    <Button variant="ghost" onclick={close}>{m.admin.cancel}</Button>
    <Button variant="danger" {busy} onclick={act}>{confirmLabel}</Button>
  {/snippet}
</Dialog>

<Dialog open={!!report} title={report ? (report.target.kind === 'message' ? m.reports.titleMessage(report.name) : m.reports.titleUser(report.name)) : ''} onclose={close}>
  {#if report}
    <p>{m.reports.body}</p>
    <fieldset class="group reasons">
      <legend class="label">{m.reports.reason}</legend>
      {#each REASONS as r (r)}
        <label class="choice"><input type="radio" name="report-reason" value={r} bind:group={why} />{m.reports.reasons[r]}</label>
      {/each}
    </fieldset>
    <div class="group">
      <label class="label" for="report-notes">{m.reports.notes}</label>
      <textarea id="report-notes" rows="3" bind:value={notes} maxlength={500} aria-describedby="report-notes-note"></textarea>
      <p class="note" id="report-notes-note">{m.reports.notesHint}</p>
    </div>
  {/if}
  {#snippet actions()}
    <Button variant="ghost" onclick={close}>{m.admin.cancel}</Button>
    <Button variant="danger" {busy} disabled={!why} onclick={sendReport}>{m.reports.send}</Button>
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
  .reasons { margin: var(--space-4) 0 0; padding: 0; border: 0; }
  .choice { display: flex; align-items: center; gap: var(--space-3); min-height: 2rem; color: var(--text-normal); font: var(--text-md) var(--font-sans); }
  .choice input { accent-color: var(--accent); }
</style>
