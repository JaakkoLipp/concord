<script lang="ts">
  import { Menu, type MenuItem } from '@concord/ui';
  import { onMount } from 'svelte';
  import { has, memberKey, Permission, type Session, type Store } from '@concord/domain';
  import { m } from '$lib/i18n/index.ts';
  import { fullDate, ulidTime } from '$lib/markdown/time.ts';
  import { serverPerms } from '$lib/view/admin.ts';
  import { moderationView } from './moderation.svelte.ts';
  import { kickBanItems, nicknameItem, removeAvatarItem, roleItem, timeoutItem } from './members.ts';
  import { moderationItems as voiceModerationItems } from '$lib/call/moderation.ts';
  import { untrack } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';
  import type { AuditEntry, User } from '@concord/domain';
  import { auditNames, describe } from './audit.ts';
  import { shortDate } from '$lib/markdown/time.ts';

  let { session, store }: { session: Session; store: Store } = $props();
  const current = $derived(moderationView.current);
  const member = $derived(current ? store.members.get(memberKey(current.server, current.user)) : undefined);
  const server = $derived(current ? store.servers.get(current.server) : undefined);
  const name = $derived(current ? store.displayName(current.user, current.server) : '');
  const canView = $derived.by(() => {
    if (!current) return false;
    const mine = serverPerms(store, current.server);
    return [Permission.KickMembers, Permission.BanMembers, Permission.TimeoutMembers, Permission.AssignRoles,
      Permission.ManageNicknames, Permission.RemoveAvatars, Permission.MuteMembers, Permission.DeafenMembers,
      Permission.MoveMembers, Permission.ManageMessages, Permission.ViewAuditLogs].some((permission) => has(mine, permission));
  });
  $effect(() => { if (current && (!canView || !member || !server)) moderationView.close(); });
  let now = $state(Date.now());
  onMount(() => {
    const timer = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(timer);
  });
  const timeout = $derived(member?.timeout && new Date(member.timeout).getTime() > now ? new Date(member.timeout) : null);
  const roles = $derived.by(() => (member?.roles ?? []).map((id) => server?.roles[id]).filter((role) => !!role).sort((a, b) => a!.rank - b!.rank));
  /** Sent with the timeout and voice actions taken from here, for the audit log (m4.7-plan.md task 6). Kick and ban ask in their dialogs. */
  let reason = $state('');
  $effect(() => { void current; reason = ''; });
  const why = () => reason.trim() || undefined;
  const actions = $derived.by(() => {
    if (!current) return [];
    const items: MenuItem[] = [];
    const nickname = nicknameItem(session, current.server, current.user);
    const avatar = removeAvatarItem(session, current.server, current.user);
    const roles = roleItem(session, current.server, current.user);
    if (nickname) items.push(nickname);
    if (avatar) items.push(avatar);
    if (roles) items.push(roles);
    const timeout = timeoutItem(session, current.server, current.user, why);
    const voice = [...(timeout ? [timeout] : []), ...voiceModerationItems(session, current.user, current.server, why)];
    const kickBan = kickBanItems(session, current.server, current.user);
    if (voice.length) { if (items.length) items.push('separator'); items.push(...voice); }
    if (kickBan.length) { if (items.length) items.push('separator'); items.push(...kickBan); }
    return items;
  });

  // Their latest audit log entries (m4.7-plan.md tasks 4 and 8), with View audit logs: one request when the panel opens.
  let audit = $state<AuditEntry[]>([]);
  const auditUsers = new SvelteMap<string, User>();
  const names = $derived(current ? auditNames(store, current.server, auditUsers) : null);
  $effect(() => {
    const c = current;
    audit = [];
    // Only a new member asks again: unrelated store changes mustn't spend the server's shared limit.
    if (!c || !untrack(() => has(serverPerms(store, c.server), Permission.ViewAuditLogs))) return;
    let stale = false;
    untrack(() => void session.admin.auditLog(c.server, { target: c.user, limit: 5 }).then((page) => {
      if (stale) return;
      for (const u of page.users) auditUsers.set(u.id, u);
      audit = page.entries;
    }).catch(() => {}));
    return () => { stale = true; };
  });

  let menuOpen = $state(false);
  let menuButton = $state<HTMLElement | null>(null);
</script>

{#if current && canView && member && server}
  <aside class="panel" aria-label={m.people.moderationView}>
    <header>
      <div><h2>{name}</h2><p>{store.users.get(current.user)?.username ?? ''}</p></div>
      <div class="tools">
        <button class="actions" bind:this={menuButton} onclick={() => (menuOpen = true)} disabled={!actions.length}>{m.people.menu}</button>
        <button class="close" aria-label={m.shell.closeModeration} onclick={() => moderationView.close()}>×</button>
        <Menu open={menuOpen} onclose={() => (menuOpen = false)} items={actions} label={m.people.menu} anchor={menuButton} />
      </div>
    </header>
    <label class="reason">
      <span>{m.moderation.panelReason}</span>
      <input type="text" maxlength={1024} bind:value={reason} />
    </label>
    <section class="dates">
      <div><h3>{m.moderation.joined}</h3><p>{fullDate(new Date(member.joinedAt))}</p></div>
      <div><h3>{m.moderation.created}</h3><p>{fullDate(ulidTime(current.user))}</p></div>
    </section>
    <section>
      <h3>{m.moderation.roles}</h3>
      {#if roles.length}
        <ul class="roles">{#each roles as role (role!.id)}<li><span class="swatch" style:--role={role!.colour ?? 'var(--text-muted)'}></span>{role!.name}</li>{/each}</ul>
      {:else}<p class="empty">{m.moderation.noRoles}</p>{/if}
    </section>
    {#if audit.length && names}
      <section>
        <h3>{m.admin.audit.recent}</h3>
        <ul class="audit">
          {#each audit as e (e.id)}
            <li><strong>{names.user(e.user)}</strong> {describe(e, names)}{#if e.reason} · {e.reason}{/if} <time>{shortDate(ulidTime(e.id))}</time></li>
          {/each}
        </ul>
      </section>
    {/if}
    {#if timeout || !member.canPublish || !member.canReceive}
      <section>
        <h3>{m.voiceMod.title}</h3>
        <ul class="status">
          {#if timeout}<li>{m.moderation.timeout} {fullDate(timeout)}</li>{/if}
          {#if !member.canPublish}<li>{m.moderation.serverMute}</li>{/if}
          {#if !member.canReceive}<li>{m.moderation.serverDeafen}</li>{/if}
        </ul>
      </section>
    {/if}
  </aside>
{/if}

<style>
  .panel { height: 100%; overflow-y: auto; box-sizing: border-box; padding: var(--space-5); display: grid; align-content: start; gap: var(--space-6); background: var(--surface-2); }
  header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-3); }
  h2 { margin: 0; color: var(--text-strong); font: 700 var(--text-xl) var(--font-sans); overflow-wrap: anywhere; }
  header p, section p { margin: var(--space-1) 0 0; color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  .tools { position: relative; display: flex; gap: var(--space-2); }
  button { border: 0; border-radius: var(--radius-md); background: var(--surface-4); color: var(--text-normal); cursor: pointer; font: 500 var(--text-sm) var(--font-sans); }
  .actions { padding: var(--space-2) var(--space-3); }
  .close { width: 2rem; height: 2rem; font-size: 1.25rem; }
  button:disabled { opacity: 0.5; cursor: default; }
  section { display: grid; gap: var(--space-2); }
  h3 { margin: 0; color: var(--text-secondary); font: 700 var(--text-xs) var(--font-sans); }
  .dates { display: flex; flex-wrap: wrap; gap: var(--space-6); }
  .dates p { color: var(--text-normal); }
  .roles, .status { display: flex; flex-wrap: wrap; gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
  .roles li { display: inline-flex; align-items: center; gap: var(--space-2); padding: var(--space-1) var(--space-3); border-radius: var(--radius-xs); background: var(--surface-4); color: var(--text-normal); font: 500 var(--text-xs) var(--font-sans); }
  .swatch { width: 10px; height: 10px; border-radius: 50%; background: var(--role); }
  .status li { color: var(--text-normal); font: var(--text-sm) var(--font-sans); }
  .empty { margin: 0; }
  .audit { display: grid; gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
  .audit li { color: var(--text-normal); font: var(--text-sm) var(--font-sans); overflow-wrap: anywhere; }
  .audit strong { color: var(--text-strong); font-weight: 600; }
  .audit time { color: var(--text-secondary); font: var(--text-xs) var(--font-sans); font-variant-numeric: tabular-nums; }
  .reason { display: grid; gap: var(--space-2); }
  .reason span { color: var(--text-secondary); font: 700 var(--text-xs) var(--font-sans); }
  .reason input {
    padding: var(--space-2) var(--space-3); border: 1px solid var(--border-control); border-radius: var(--radius-md);
    background: var(--surface-0); color: var(--text-strong); font: var(--text-sm) var(--font-sans);
  }
  .reason input:focus-visible { outline: none; border-color: var(--accent); }
</style>
