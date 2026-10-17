<script lang="ts">
  /**
   * Notification settings for a server, a channel, a DM or a group (m2c-plan.md): the level, Default showing
   * what it inherits, and the mute. Each change is saved as it is made.
   */
  import { Button, Dialog } from '@concord/ui';
  import type { NotificationLevel, Session } from '@concord/domain';
  import { m } from '$lib/i18n/index.ts';
  import { channelName } from '$lib/view/channels.ts';
  import { toasts } from '$lib/view/toast.svelte.ts';
  import { notifyDialog } from './dialog.svelte.ts';

  let { session }: { session: Session } = $props();
  const store = $derived(session.store);
  const t = $derived(notifyDialog.current);
  const n = $derived(store.settings.notifications);
  const name = $derived.by(() => {
    if (!t) return '';
    if (t.scope === 'server') return store.servers.get(t.id)?.name ?? '';
    const c = store.channels.get(t.id);
    return c ? (c.kind === 'text' ? `#${c.name}` : channelName(store, c)) : '';
  });
  const own = $derived(t ? (t.scope === 'server' ? n.server[t.id] : n.channel[t.id]) : undefined);
  const inherited = $derived.by((): NotificationLevel => {
    if (!t) return 'all';
    if (t.scope === 'server') return 'mention';
    return store.defaultLevel(t.id);
  });
  const mute = $derived(t ? (t.scope === 'server' ? n.serverMutes[t.id] : n.channelMutes[t.id]) : undefined);
  const muted = $derived(t ? (t.scope === 'server' ? store.serverMuted(t.id) : store.isMuted(t.id)) : false);
  const LEVELS: NotificationLevel[] = ['all', 'mention', 'none'];
  const DURATIONS = [15, 60, 480, 1440] as const;

  async function setLevel(level: NotificationLevel | null) {
    if (!t) return;
    await session.setNotificationLevel(t.scope, t.id, level).catch(() => toasts.show(m.notify.failed));
  }
  async function setMute(value: string) {
    if (!t) return;
    const minutes = value === 'off' ? false : value === 'forever' ? null : Number(value);
    await session.setMute(t.scope, t.id, minutes).catch(() => toasts.show(m.notify.failed));
  }
  const until = $derived(mute?.until ? new Date(mute.until).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '');
</script>

<Dialog open={!!t} title={m.notify.settingsTitle(name)} onclose={() => notifyDialog.close()}>
  <fieldset class="group">
    <legend class="label">{m.notify.level}</legend>
    <label class="option"><input type="radio" name="level" checked={!own} onchange={() => setLevel(null)} />{m.notify.default(m.notify.levels[inherited])}</label>
    {#each LEVELS as level (level)}
      <label class="option"><input type="radio" name="level" checked={own === level} onchange={() => setLevel(level)} />{m.notify.levels[level]}</label>
    {/each}
  </fieldset>
  <label class="group">
    <span class="label">{m.notify.mute}</span>
    <select value={muted ? (mute?.until ? 'timed' : 'forever') : 'off'} onchange={(e) => setMute(e.currentTarget.value)}>
      <option value="off">{m.notify.muteFor.off}</option>
      {#if muted && mute?.until}<option value="timed" disabled>{m.notify.mutedUntil(until)}</option>{/if}
      {#each DURATIONS as d (d)}<option value={String(d)}>{m.notify.muteFor[d]}</option>{/each}
      <option value="forever">{m.notify.muteFor.forever}</option>
    </select>
  </label>
  <p class="note">{m.notify.mutedHint}</p>
  {#if t?.scope === 'server'}
    {@const server = t.id}
    <label class="check">
      <input type="checkbox" checked={!!store.ignoredMentions[server]}
        onchange={(e) => void session.setIgnoreBroadMentions(server, e.currentTarget.checked).catch(() => toasts.show(m.notify.failed))} />
      <span>{m.notify.ignoreBroad}</span>
    </label>
    <p class="note">{m.notify.ignoreBroadHelp}</p>
  {/if}
  {#snippet actions()}<Button onclick={() => notifyDialog.close()}>{m.admin.invite.done}</Button>{/snippet}
</Dialog>

<style>
  .group { display: grid; gap: var(--space-2); margin: 0 0 var(--space-5); padding: 0; border: 0; }
  .label { padding: 0; color: var(--text-secondary); font: 700 var(--text-xs) var(--font-sans); letter-spacing: 0.02em; text-transform: uppercase; }
  .option { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) 0; color: var(--text-strong); font: 500 var(--text-md) var(--font-sans); cursor: pointer; }
  select { padding: var(--space-3) var(--space-4); background: var(--surface-0); color: var(--text-strong); border: 1px solid var(--border-control); border-radius: var(--radius-md); font: var(--text-md) var(--font-sans); }
  .note { margin: 0; color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  .check { display: flex; align-items: center; gap: var(--space-3); margin-top: var(--space-5); padding: var(--space-2) 0; color: var(--text-strong); font: 500 var(--text-md) var(--font-sans); cursor: pointer; }
  .check input { accent-color: var(--accent); }
  .check + .note { margin-top: var(--space-1); }
</style>
