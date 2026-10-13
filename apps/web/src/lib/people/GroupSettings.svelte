<script lang="ts">
  /** Rename a group, describe it and set its icon (m2b-plan.md task 4). Any member may, as on Stoat. */
  import { Button, Dialog, TextField } from '@concord/ui';
  import Users from '@lucide/svelte/icons/users';
  import { fileUrl } from '@concord/stoat';
  import type { GroupChannel, GroupEdit, Session } from '@concord/domain';
  import { m } from '$lib/i18n/index.ts';

  interface Props { session: Session; group: GroupChannel; open: boolean; onclose: () => void }
  let { session, group, open, onclose }: Props = $props();
  let name = $state('');
  let description = $state('');
  let icon = $state<File | null>(null);
  let iconRemoved = $state(false);
  let preview = $state<string | null>(null);
  let error = $state<string | undefined>();
  let busy = $state(false);
  let picker = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (!open) return;
    name = group.name;
    description = group.description ?? '';
    icon = null;
    iconRemoved = false;
    preview = null;
    error = undefined;
  });
  $effect(() => () => { if (preview) URL.revokeObjectURL(preview); });

  const limit = $derived(session.store.node?.uploadLimits.icons ?? 2_500_000);
  const shownIcon = $derived(preview ?? (!iconRemoved && group.icon ? fileUrl(group.icon, { maxSide: 128 }) : null));

  function choose(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { error = m.groups.imageOnly; return; }
    if (file.size > limit) { error = m.groups.iconTooLarge(Math.round(limit / 100_000) / 10); return; }
    error = undefined;
    icon = file;
    iconRemoved = false;
    if (preview) URL.revokeObjectURL(preview);
    preview = URL.createObjectURL(file);
  }

  async function save() {
    busy = true;
    error = undefined;
    try {
      const change: GroupEdit = {};
      const remove: GroupEdit['remove'] = [];
      if (name.trim() && name.trim() !== group.name) change.name = name.trim();
      if (description.trim() !== (group.description ?? '')) {
        if (description.trim()) change.description = description.trim();
        else remove.push('description');
      }
      if (icon) change.icon = await session.backend.upload(icon, icon.name, undefined, 'icons');
      else if (iconRemoved && group.icon) remove.push('icon');
      if (remove.length) change.remove = remove;
      if (Object.keys(change).length) await session.editGroup(group.id, change);
      onclose();
    } catch {
      error = m.groups.failed;
    } finally {
      busy = false;
    }
  }
</script>

<Dialog {open} title={m.groups.settingsTitle} {onclose} width="30rem">
  <div class="form">
    <div class="icon-row">
      {#if shownIcon}<img class="icon" src={shownIcon} alt="" width="64" height="64" />{:else}<span class="icon blank" aria-hidden="true"><Users size={28} /></span>{/if}
      <div class="icon-buttons">
        <Button size="sm" variant="secondary" onclick={() => picker?.click()}>{m.groups.changeIcon}</Button>
        {#if shownIcon}<Button size="sm" variant="ghost" onclick={() => { icon = null; iconRemoved = true; preview = null; }}>{m.groups.removeIcon}</Button>{/if}
      </div>
      <input bind:this={picker} type="file" accept="image/*" hidden onchange={choose} />
    </div>
    <TextField label={m.groups.name} bind:value={name} maxlength={32} required />
    <TextField label={m.groups.description} bind:value={description} maxlength={1024} />
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  </div>
  {#snippet actions()}
    <Button variant="ghost" onclick={onclose}>{m.groups.cancel}</Button>
    <Button onclick={save} {busy} disabled={!name.trim()}>{m.groups.save}</Button>
  {/snippet}
</Dialog>

<style>
  .form { display: grid; gap: var(--space-5); }
  .icon-row { display: flex; align-items: center; gap: var(--space-5); }
  .icon { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; }
  .icon.blank { display: inline-grid; place-items: center; background: var(--accent); color: var(--on-accent); }
  .icon-buttons { display: flex; gap: var(--space-3); }
  .error { margin: 0; color: var(--danger); font: var(--text-sm) var(--font-sans); }
</style>
