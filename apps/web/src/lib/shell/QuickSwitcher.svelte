<script lang="ts">
  /**
   * The quick switcher (M4.8 task 3): Ctrl+K, or the DM list's button. It searches the channels, servers, DMs and
   * people this account can reach. Up and Down move the selection, Enter or a click goes there, and Esc closes (the
   * Dialog does that). A voice channel only opens its route; a person without a DM gets one. It also records the
   * open channel as a recent place, here, since this is mounted on every channel route.
   */
  import { Dialog, TextField } from '@concord/ui';
  import Hash from '@lucide/svelte/icons/hash';
  import Server from '@lucide/svelte/icons/server';
  import User from '@lucide/svelte/icons/user';
  import Volume2 from '@lucide/svelte/icons/volume-2';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { m } from '$lib/i18n/index.ts';
  import { app } from '$lib/session/app.svelte.ts';
  import { firstChannel, recalled } from '$lib/view/channels.ts';
  import { recentPlaces, rememberPlace, switcher } from '$lib/view/switcher.svelte.ts';
  import { placesFrom, results, type Row } from '$lib/view/switcherResults.ts';
  import { toasts } from '$lib/view/toast.svelte.ts';

  const uid = $props.id();
  const listId = `switcher-list-${uid}`;
  const optionId = (i: number) => `switcher-option-${uid}-${i}`;
  let input = $state<HTMLInputElement | null>(null);

  // Every channel the account is shown is a recent place, however it was opened.
  $effect(() => {
    const channel = page.params.channel;
    const account = app.session?.store.selfId;
    if (channel && account) rememberPlace(account, channel);
  });

  const rows: Row[] = $derived.by(() => {
    const session = app.session;
    if (!session || !switcher.open) return [];
    return results(switcher.query, placesFrom(session.store), recentPlaces(session.store.selfId ?? ''));
  });
  const sel = $derived(Math.min(switcher.selected, Math.max(rows.length - 1, 0)));

  // The dialog's own focus runs before the box is on screen, so the box takes focus once the frame is up.
  $effect(() => {
    if (!switcher.open) return;
    const frame = requestAnimationFrame(() => input?.focus());
    return () => cancelAnimationFrame(frame);
  });

  // Keeps the selected row in view as the arrows move it.
  $effect(() => {
    void rows;
    document.getElementById(optionId(sel))?.scrollIntoView({ block: 'nearest' });
  });

  async function go(row: Row): Promise<void> {
    const session = app.session;
    switcher.close();
    if (!session) return;
    if (row.kind === 'channel' || row.kind === 'voice') {
      // A voice channel's route only: the sidebar's click joins a call, this doesn't.
      await goto(resolve('/(app)/app/channels/[server]/[channel]/[[message]]', { server: row.server ?? '', channel: row.id }));
    } else if (row.kind === 'dm') {
      await goto(resolve('/(app)/app/channels/@me/[channel]/[[message]]', { channel: row.id }));
    } else if (row.kind === 'server') {
      // As the rail's link: the channel last visited there, else its first, else the friends screen.
      const channel = recalled(row.id) ?? firstChannel(session.store, row.id);
      await goto(channel ? resolve('/(app)/app/channels/[server]/[channel]/[[message]]', { server: row.id, channel }) : resolve('/app/channels/@me'));
    } else {
      let channel: string;
      try {
        channel = await session.openDm(row.id);
      } catch {
        toasts.show(m.groups.failed);
        return;
      }
      await goto(resolve('/(app)/app/channels/@me/[channel]/[[message]]', { channel }));
    }
  }

  function onkeydown(e: KeyboardEvent): void {
    if (e.isComposing) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!rows.length) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      switcher.selected = (sel + step + rows.length) % rows.length;
    } else if (e.key === 'Enter') {
      const row = rows[sel];
      if (!row) return;
      e.preventDefault();
      void go(row);
    }
  }
</script>

<Dialog open={switcher.open} title={m.switcher.title} onclose={() => switcher.close()} still={switcher.still} width="36rem">
  <TextField
    label={m.switcher.label}
    hideLabel
    placeholder={m.switcher.label}
    bind:value={switcher.query}
    bind:input
    role="combobox"
    autocomplete="off"
    aria-autocomplete="list"
    aria-expanded="true"
    aria-controls={listId}
    aria-activedescendant={rows.length ? optionId(sel) : undefined}
    oninput={() => (switcher.selected = 0)}
    onkeydown={onkeydown}
  />
  <div id={listId} class="list" role="listbox" aria-label={m.switcher.results}>
    {#each rows as row, i (row.kind + row.id)}
      <button
        type="button"
        id={optionId(i)}
        class="row"
        role="option"
        tabindex="-1"
        aria-selected={i === sel}
        data-id={row.id}
        data-kind={row.kind}
        onclick={() => void go(row)}
        onmousemove={() => (switcher.selected = i)}
      >
        <span class="icon" aria-hidden="true">
          {#if row.kind === 'voice'}<Volume2 size={20} />{:else if row.kind === 'channel'}<Hash size={20} />{:else if row.kind === 'server'}<Server size={20} />{:else}<User size={20} />{/if}
        </span>
        <span class="title">{row.title}</span>
        {#if row.detail}<span class="detail">{row.detail}</span>{/if}
        <span class="kind">{m.switcher.kind[row.kind]}</span>
      </button>
    {/each}
  </div>
  {#if !rows.length}
    <p class="none">{switcher.query.trim() ? m.switcher.none : m.switcher.empty}</p>
  {/if}
</Dialog>

<style>
  .list { display: grid; gap: var(--space-1); max-height: 60vh; margin-top: var(--space-4); overflow-y: auto; }
  .row {
    display: flex; align-items: center; gap: var(--space-3); width: 100%; min-height: var(--control-h); padding: var(--space-2) var(--space-3);
    border: 0; border-radius: var(--radius-md); background: none; color: var(--text-normal); font: 500 var(--text-md) var(--font-sans); text-align: start; cursor: pointer;
  }
  .row[aria-selected='true'] { background: var(--surface-5); color: var(--text-strong); }
  .icon { display: grid; flex: none; place-items: center; width: 1.5rem; color: var(--text-secondary); }
  .title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .detail { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  .kind { flex: none; margin-inline-start: auto; color: var(--text-secondary); font: var(--text-xs) var(--font-sans); }
  .none { margin: var(--space-4) 0 0; color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
</style>
