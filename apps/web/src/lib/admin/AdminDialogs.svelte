<script lang="ts">
  /**
   * Create channel, create or rename a category, and move a channel to a category (m2c-plan.md task 3).
   * Category writes go through the session's merged writer, so a quick series ends in the last order.
   */
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { Button, Dialog, TextField } from '@concord/ui';
  import { Permission, addCategory, has, moveChannelTo, renameCategory, ulid, type Session } from '@concord/domain';
  import { serverPerms } from '$lib/view/admin.ts';
  import { assignable } from './members.ts';
  import { m } from '$lib/i18n/index.ts';
  import { toasts } from '$lib/view/toast.svelte.ts';
  import { adminDialogs } from './dialogs.svelte.ts';

  let { session }: { session: Session } = $props();
  const store = $derived(session.store);
  // Member roles have their own dialog.
  const d = $derived(adminDialogs.current?.kind === 'memberRoles' ? null : adminDialogs.current);
  const server = $derived(d ? store.servers.get(d.server) : undefined);

  let name = $state('');
  let kind = $state<'text' | 'voice'>('text');
  let category = $state('');
  let isPrivate = $state(false);
  let privateTo = $state<string[]>([]);
  const canPrivate = $derived(!!d && has(serverPerms(store, d.server), Permission.ManagePermissions));
  const privateRoles = $derived(d ? assignable(session, d.server) : []);
  let busy = $state(false);
  let filledFor: unknown = null;

  // Fill the fields once per dialog opened, never while typing.
  $effect(() => {
    if (d === filledFor) return;
    filledFor = d;
    if (!d) return;
    kind = 'text';
    if (d.kind === 'createChannel') { name = ''; category = d.category ?? ''; isPrivate = false; privateTo = []; }
    if (d.kind === 'category') name = d.id ? (server?.categories.find((c) => c.id === d.id)?.title ?? '') : '';
    if (d.kind === 'moveChannel') category = server?.categories.find((c) => c.channels.includes(d.channel))?.id ?? '';
  });

  /** Text channel names as Discord makes them: lower case, with dashes for spaces. */
  const channelName = $derived(kind === 'text' ? name.toLocaleLowerCase('fi').replace(/\s+/g, '-') : name.trim());
  const length = (s: string) => [...s.trim()].length;
  const nameError = $derived(name && (length(channelName) < 1 || length(channelName) > 32) ? m.admin.nameError : undefined);
  const channelLabel = $derived(d?.kind === 'moveChannel' ? (store.channels.get(d.channel) as { name?: string } | undefined)?.name ?? '' : '');

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    // Read once: both are derived from the open dialog, and closing it clears them.
    const d = adminDialogs.current?.kind === 'memberRoles' ? null : adminDialogs.current;
    const server = d ? store.servers.get(d.server) : undefined;
    if (!d || !server || busy) return;
    busy = true;
    try {
      if (d.kind === 'createChannel') {
        if (!length(channelName) || nameError) return;
        const channel = await session.admin.createChannel(server.id, kind, channelName.trim(), category || null, isPrivate ? { privateTo } : {});
        adminDialogs.close();
        if (kind === 'text') await goto(resolve('/(app)/app/channels/[server]/[channel]/[[message]]', { server: server.id, channel: channel.id }));
      } else if (d.kind === 'category') {
        const title = name.trim();
        if (!title || length(title) > 32) return;
        adminDialogs.close();
        await session.admin.setCategories(server.id, d.id ? renameCategory(server.categories, d.id, title) : addCategory(server.categories, ulid(), title));
      } else {
        adminDialogs.close();
        await session.admin.setCategories(server.id, moveChannelTo(server.categories, d.channel, category || null));
      }
    } catch {
      toasts.show(m.admin.channelFailed);
    } finally {
      busy = false;
    }
  }

  const title = $derived(!d ? '' : d.kind === 'createChannel' ? m.admin.createChannel : d.kind === 'category' ? (d.id ? m.admin.renameCategory : m.admin.createCategory) : m.admin.moveTitle(channelLabel));
  const action = $derived(!d ? '' : d.kind === 'createChannel' ? m.admin.createChannel : d.kind === 'category' ? (d.id ? m.admin.rename : m.admin.createCategory) : m.admin.move);
</script>

<Dialog open={!!d && !!server} {title} onclose={() => adminDialogs.close()}>
  <form id="admin-dialog" class="form" onsubmit={submit}>
    {#if d?.kind === 'createChannel'}
      <fieldset class="kinds">
        <legend class="label">{m.admin.channelType}</legend>
        <label class="kind"><input type="radio" bind:group={kind} value="text" /><span><strong>{m.admin.text}</strong><small>{m.admin.textHelp}</small></span></label>
        <label class="kind"><input type="radio" bind:group={kind} value="voice" /><span><strong>{m.admin.voice}</strong><small>{m.admin.voiceHelp}</small></span></label>
      </fieldset>
      <TextField label={m.admin.channelName} bind:value={name} error={nameError} hint={kind === 'text' && name && channelName !== name ? channelName : undefined} maxlength={64} />
      {#if canPrivate}
        <label class="private">
          <input type="checkbox" bind:checked={isPrivate} />
          <span><strong>{m.admin.privateChannel}</strong><small>{m.admin.privateHelp}</small></span>
        </label>
        {#if isPrivate}
          <fieldset class="roles">
            <legend class="label">{m.admin.privateRoles}</legend>
            {#each privateRoles as role (role.id)}
              <label class="role"><input type="checkbox" value={role.id} bind:group={privateTo} /><span class="swatch" style:background={role.colour ?? 'var(--text-muted)'} aria-hidden="true"></span>{role.name}</label>
            {/each}
            <p class="note">{m.admin.privateNote}</p>
          </fieldset>
        {/if}
      {/if}
    {:else if d?.kind === 'category'}
      <TextField label={m.admin.categoryName} bind:value={name} error={name && length(name) > 32 ? m.admin.nameError : undefined} maxlength={64} />
    {/if}
    {#if d?.kind === 'createChannel' || d?.kind === 'moveChannel'}
      <label class="pick">
        <span class="label">{m.admin.category}</span>
        <select bind:value={category}>
          <option value="">{m.admin.noCategory}</option>
          {#each server?.categories ?? [] as c (c.id)}<option value={c.id}>{c.title}</option>{/each}
        </select>
      </label>
    {/if}
  </form>
  {#snippet actions()}
    <Button variant="ghost" onclick={() => adminDialogs.close()}>{m.admin.cancel}</Button>
    <Button type="submit" form="admin-dialog" {busy} disabled={d?.kind !== 'moveChannel' && (!length(d?.kind === 'createChannel' ? channelName : name) || !!nameError)}>{action}</Button>
  {/snippet}
</Dialog>

<style>
  .form { display: grid; gap: var(--space-5); }
  .label { padding: 0; color: var(--text-secondary); font: 700 var(--text-xs) var(--font-sans); letter-spacing: 0.02em; text-transform: uppercase; }
  .kinds { display: grid; gap: var(--space-2); margin: 0; padding: 0; border: 0; }
  .kind { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3) var(--space-4); border-radius: var(--radius-md); background: var(--surface-3); cursor: pointer; }
  .kind:has(input:checked) { background: var(--surface-5); }
  .kind span { display: grid; }
  .kind strong { color: var(--text-strong); font: 500 var(--text-md) var(--font-sans); }
  .kind small { color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  .pick { display: grid; gap: var(--space-2); }
  .private { display: flex; align-items: flex-start; gap: var(--space-3); cursor: pointer; }
  .private input { margin-top: 0.2rem; }
  .private span { display: grid; gap: 2px; }
  .private strong { color: var(--text-strong); font: 500 var(--text-md) var(--font-sans); }
  .private small, .note { color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  .note { margin: var(--space-2) 0 0; }
  .roles { display: grid; gap: var(--space-1); margin: 0; padding: 0; border: 0; max-height: 12rem; overflow-y: auto; }
  .role { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-1) 0; color: var(--text-normal); font: 500 var(--text-md) var(--font-sans); cursor: pointer; }
  .swatch { width: 0.75rem; height: 0.75rem; border-radius: var(--radius-full); flex: none; }
  select { padding: var(--space-3) var(--space-4); background: var(--surface-0); color: var(--text-strong); border: 1px solid var(--border-control); border-radius: var(--radius-md); font: var(--text-md) var(--font-sans); }
  select:focus-visible { outline: none; border-color: var(--accent); }
</style>
