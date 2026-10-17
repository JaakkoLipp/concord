<script lang="ts">
  /**
   * A new folder from a server's menu, the keyboard path for dropping one server on another, or a folder's new name
   * (M4.8 task 10b). A new folder takes at least two servers; one already in a folder moves into the new one.
   */
  import { Button, Dialog, TextField } from '@concord/ui';
  import { FOLDER_NAME_MAX, makeFolder, renameFolder, ulid, type Session } from '@concord/domain';
  import { m } from '$lib/i18n/index.ts';
  import { saveRail } from '$lib/admin/menu.ts';
  import { railOf } from '$lib/view/channels.ts';
  import { folderDialog } from '$lib/view/folders.svelte.ts';

  let { session }: { session: Session } = $props();
  const t = m.shell.folders;
  const store = $derived(session.store);
  const d = $derived(folderDialog.current);
  const rail = $derived(railOf(store));
  const servers = $derived(rail.flatMap((i) => (i.kind === 'server' ? [i.id] : i.folder.servers)).map((id) => store.servers.get(id)).filter((s) => !!s));
  const folderName = (id: string) => {
    const f = rail.find((i) => i.kind === 'folder' && i.folder.id === id);
    return f?.kind === 'folder' ? f.folder.name || t.unnamed(f.folder.servers.map((s) => store.servers.get(s)?.name ?? '')) : '';
  };
  const holder = (server: string) => rail.find((i) => i.kind === 'folder' && i.folder.servers.includes(server));

  let name = $state('');
  let chosen = $state<string[]>([]);
  let error = $state<string | undefined>();

  // A fresh form each time it opens.
  $effect(() => {
    const cur = folderDialog.current;
    if (!cur) return;
    error = undefined;
    if (cur.kind === 'create') {
      name = '';
      chosen = [cur.server];
    } else {
      const f = railOf(session.store).find((i) => i.kind === 'folder' && i.folder.id === cur.folder);
      name = f?.kind === 'folder' ? f.folder.name : '';
    }
  });

  function toggle(id: string, on: boolean) {
    chosen = on ? [...chosen, id] : chosen.filter((x) => x !== id);
  }

  function submit(e: SubmitEvent) {
    e.preventDefault();
    const cur = folderDialog.current;
    if (!cur) return;
    if (cur.kind === 'create') {
      if (chosen.length < 2) return void (error = t.pickTwo);
      saveRail(session, rail, makeFolder(rail, chosen, ulid(), name));
    } else {
      saveRail(session, rail, renameFolder(rail, cur.folder, name));
    }
    folderDialog.close();
  }
</script>

<Dialog open={!!d} title={d?.kind === 'rename' ? t.renameTitle : t.createTitle} onclose={() => folderDialog.close()}>
  <form id="folder-form" onsubmit={submit}>
    <TextField label={t.name} bind:value={name} maxlength={FOLDER_NAME_MAX} hint={t.nameHint} autocomplete="off" />
    {#if d?.kind === 'create'}
      <fieldset>
        <legend>{t.servers}</legend>
        {#each servers as s (s.id)}
          {@const f = holder(s.id)}
          <label class="server">
            <input type="checkbox" checked={chosen.includes(s.id)} onchange={(e) => toggle(s.id, e.currentTarget.checked)} />
            <span class="name">{s.name}</span>
            {#if f?.kind === 'folder'}<span class="where">{t.inFolder(folderName(f.folder.id))}</span>{/if}
          </label>
        {/each}
      </fieldset>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
    {/if}
  </form>
  {#snippet actions()}
    <Button variant="ghost" onclick={() => folderDialog.close()}>{t.cancel}</Button>
    <Button type="submit" form="folder-form">{d?.kind === 'rename' ? t.save : t.createSubmit}</Button>
  {/snippet}
</Dialog>

<style>
  form { display: grid; gap: var(--space-5); }
  fieldset { display: grid; gap: var(--space-1); max-height: 16rem; margin: 0; padding: 0; overflow-y: auto; border: 0; }
  legend { margin-bottom: var(--space-3); padding: 0; color: var(--text-secondary); font: 700 var(--text-xs) var(--font-sans); letter-spacing: 0.02em; text-transform: uppercase; }
  .server { display: flex; align-items: center; gap: var(--space-3); min-height: var(--row-channel); padding: 0 var(--space-2); border-radius: var(--radius-xs); cursor: pointer; }
  @media (hover: hover) { .server:hover { background: var(--hover-overlay); } }
  .server input { accent-color: var(--accent); }
  .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-normal); font: var(--text-md) var(--font-sans); }
  .where { color: var(--text-muted); font: var(--text-xs) var(--font-sans); }
  .error { margin: 0; color: var(--danger); font: var(--text-sm) var(--font-sans); }
</style>
