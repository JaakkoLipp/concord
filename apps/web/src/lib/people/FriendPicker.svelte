<script lang="ts">
  /**
   * Choose friends (m2b-plan.md task 4): for a new DM or group, or to add to a group. Stoat lets only
   * friends be invited, so only friends are offered.
   */
  import { Avatar, Button, Dialog, TextField } from '@concord/ui';
  import type { Id, Session } from '@concord/domain';
  import { m } from '$lib/i18n/index.ts';
  import { avatarUrl, presenceOf } from '$lib/view/users.ts';

  interface Props {
    session: Session;
    open: boolean;
    title: string;
    /** Friends already in the group, left out. */
    exclude?: Id[];
    /** How many may be chosen. */
    max: number;
    /** A new conversation: one friend opens a DM, several make a group with an optional name. */
    fresh?: boolean;
    onclose: () => void;
    onpick: (users: Id[], name: string) => Promise<void>;
  }
  let { session, open, title, exclude = [], max, fresh = false, onclose, onpick }: Props = $props();
  let query = $state('');
  let name = $state('');
  let chosen = $state<Id[]>([]);
  let busy = $state(false);
  let error = $state<string | undefined>();

  $effect(() => {
    if (!open) return;
    query = '';
    name = '';
    chosen = [];
    error = undefined;
  });

  const friends = $derived(session.store.related('Friend').filter((u) => !exclude.includes(u.id)));
  const shown = $derived(friends.filter((u) => {
    const q = query.trim().toLocaleLowerCase();
    return !q || u.username.toLocaleLowerCase().includes(q) || !!u.displayName?.toLocaleLowerCase().includes(q);
  }));
  const toggle = (id: Id) => (chosen = chosen.includes(id) ? chosen.filter((c) => c !== id) : chosen.length < max ? [...chosen, id] : chosen);
  const label = $derived(fresh ? (chosen.length > 1 ? m.groups.create : m.groups.openDm) : m.groups.add);

  async function confirm() {
    busy = true;
    error = undefined;
    try {
      await onpick(chosen, name.trim());
      onclose();
    } catch {
      error = m.groups.failed;
      // Some may have been added before the failure: they leave the list, so they leave the choice too.
      const offered = new Set(friends.map((u) => u.id));
      chosen = chosen.filter((id) => offered.has(id));
    } finally {
      busy = false;
    }
  }
</script>

<Dialog {open} {title} {onclose} width="30rem">
  {#if fresh}<p class="help">{m.groups.newMessageHelp}</p>{/if}
  {#if max <= 0}
    <p class="help">{m.groups.full}</p>
  {:else if !friends.length}
    <p class="help">{m.groups.noFriends}</p>
  {:else}
    <TextField label={m.groups.search} hideLabel type="search" placeholder={m.groups.search} bind:value={query} />
    <p class="count">{m.groups.chosen(chosen.length, max)}</p>
    <ul class="list">
      {#each shown as u (u.id)}
        <li>
          <label class="friend">
            <Avatar src={avatarUrl(u)} size={32} presence={presenceOf(u)} presenceLabel={m.presence[presenceOf(u)]} />
            <span class="name">{u.displayName ?? u.username}<span class="tag">{u.username}#{u.discriminator}</span></span>
            <input type="checkbox" checked={chosen.includes(u.id)} disabled={!chosen.includes(u.id) && chosen.length >= max} onchange={() => toggle(u.id)} />
          </label>
        </li>
      {:else}
        <li class="none">{m.groups.noMatch}</li>
      {/each}
    </ul>
    {#if fresh && chosen.length > 1}
      <TextField label={m.groups.name} bind:value={name} maxlength={32} hint={m.groups.nameHint} />
    {/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  {/if}
  {#snippet actions()}
    <Button variant="ghost" onclick={onclose}>{m.groups.cancel}</Button>
    <Button onclick={confirm} busy={busy} disabled={!chosen.length}>{label}</Button>
  {/snippet}
</Dialog>

<style>
  .help { color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  .count { margin: var(--space-3) 0; color: var(--text-secondary); font: var(--text-xs) var(--font-sans); }
  .list { max-height: 18rem; overflow-y: auto; margin: 0 0 var(--space-4); padding: 0; list-style: none; }
  .friend { display: flex; align-items: center; gap: var(--space-4); min-height: 2.75rem; padding: 0 var(--space-3); border-radius: var(--radius-md); cursor: pointer; }
  @media (hover: hover) { .friend:hover { background: var(--hover-overlay); } }
  .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-strong); font: 500 var(--text-md) var(--font-sans); }
  .tag { margin-left: var(--space-3); color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  input[type='checkbox'] { width: 1.125rem; height: 1.125rem; accent-color: var(--accent); }
  .none { padding: var(--space-4); color: var(--text-secondary); text-align: center; }
  .error { margin: var(--space-3) 0 0; color: var(--danger); font: var(--text-sm) var(--font-sans); }
</style>
