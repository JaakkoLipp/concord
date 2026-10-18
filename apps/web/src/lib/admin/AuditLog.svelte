<script lang="ts">
  /**
   * The audit log section (m4.7-plan.md task 8), for View audit logs: newest first, who did what to whom, when and why,
   * filtered by who did it and by action. 50 entries a page, loaded as the end comes into view, at most one page a second,
   * since every request spends the server's shared 5 per 10 s.
   */
  import { untrack } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';
  import { Avatar } from '@concord/ui';
  import { memberKey, type AuditEntry, type Session, type User } from '@concord/domain';
  import { m } from '$lib/i18n/index.ts';
  import { fullDate, shortDate, ulidTime } from '$lib/markdown/time.ts';
  import { avatarUrl } from '$lib/view/users.ts';
  import { AUDIT_GAP_MS, AUDIT_GROUPS, AUDIT_PAGE, auditNames, describe, type AuditGroup } from './audit.ts';

  let { session, server }: { session: Session; server: string } = $props();
  const store = $derived(session.store);

  let who = $state('');
  let what = $state<AuditGroup | ''>('');
  let entries = $state<AuditEntry[]>([]);
  let done = $state(false);
  let loading = $state(false);
  let failed = $state(false);
  const users = new SvelteMap<string, User>();
  const names = $derived(auditNames(store, server, users));
  /** Bumped by every filter change, so a page for the old filter is dropped. */
  let generation = 0;
  let lastLoad = 0;
  let wait: ReturnType<typeof setTimeout> | undefined;

  const members = $derived([...store.members.values()].filter((x) => x.server === server)
    .map((x) => ({ id: x.user, name: store.displayName(x.user, server) })).sort((a, b) => a.name.localeCompare(b.name)));

  async function load() {
    if (loading || done) return;
    const gap = lastLoad + AUDIT_GAP_MS - Date.now();
    if (gap > 0) {
      clearTimeout(wait);
      wait = setTimeout(() => void load(), gap);
      return;
    }
    const gen = generation;
    loading = true;
    lastLoad = Date.now();
    try {
      const before = entries.at(-1)?.id;
      const page = await session.admin.auditLog(server, {
        limit: AUDIT_PAGE, ...(who ? { user: who } : {}), ...(what ? { types: [...AUDIT_GROUPS[what]] } : {}), ...(before ? { before } : {}),
      });
      if (gen !== generation) return;
      for (const u of page.users) users.set(u.id, u);
      entries = [...entries, ...page.entries.filter((e) => !entries.some((x) => x.id === e.id))];
      done = page.entries.length < AUDIT_PAGE;
      failed = false;
    } catch {
      if (gen === generation) failed = true;
    } finally {
      if (gen === generation) loading = false;
    }
    // A short page leaves the end in view, which the observer won't report again: ask for the next one, a second later.
    if (gen === generation && !done && !failed && end && end.getBoundingClientRect().top < innerHeight) void load();
  }

  // A new filter starts over.
  $effect(() => {
    void who;
    void what;
    void server;
    untrack(() => {
      generation++;
      clearTimeout(wait);
      entries = [];
      done = false;
      loading = false;
      failed = false;
      void load();
    });
    return () => clearTimeout(wait);
  });

  // The next page when the end of the list comes into view.
  let end = $state<HTMLElement | null>(null);
  $effect(() => {
    const el = end;
    if (!el) return;
    const io = new IntersectionObserver((seen) => { if (seen.some((s) => s.isIntersecting)) void load(); });
    io.observe(el);
    return () => io.disconnect();
  });

  const avatar = (id: string) => avatarUrl(store.users.get(id) ?? users.get(id) ?? { id }, store.members.get(memberKey(server, id))?.avatar);
</script>

<p class="intro">{m.admin.audit.intro}</p>
<div class="filters">
  <label>
    <span>{m.admin.audit.who}</span>
    <select bind:value={who}>
      <option value="">{m.admin.audit.anyone}</option>
      {#each members as x (x.id)}<option value={x.id}>{x.name}</option>{/each}
    </select>
  </label>
  <label>
    <span>{m.admin.audit.what}</span>
    <select bind:value={what}>
      <option value="">{m.admin.audit.everything}</option>
      {#each Object.keys(AUDIT_GROUPS) as AuditGroup[] as g (g)}<option value={g}>{m.admin.audit.groups[g]}</option>{/each}
    </select>
  </label>
</div>

{#if failed && !entries.length}
  <p class="intro" role="alert">{m.admin.audit.failed}</p>
{:else if done && !entries.length}
  <p class="intro">{m.admin.audit.empty}</p>
{/if}
<ul class="log">
  {#each entries as e (e.id)}
    {@const at = ulidTime(e.id)}
    <li class="entry" data-type={e.action.type}>
      <Avatar src={avatar(e.user)} size={32} />
      <div class="text">
        <p><strong>{names.user(e.user)}</strong> {describe(e, names)}</p>
        {#if e.reason}<p class="reason">{m.admin.audit.reason(e.reason)}</p>{/if}
      </div>
      <time datetime={at.toISOString()} title={fullDate(at)}>{shortDate(at)}</time>
    </li>
  {/each}
</ul>
{#if !done}
  <p class="more" bind:this={end} aria-hidden={!loading}>{loading ? m.admin.audit.more : ''}</p>
{/if}

<style>
  .intro { margin: 0 0 var(--space-5); color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  .filters { display: flex; flex-wrap: wrap; gap: var(--space-5); margin-bottom: var(--space-5); }
  label { display: grid; gap: var(--space-2); min-width: 12rem; }
  label span { color: var(--text-secondary); font: 700 var(--text-xs) var(--font-sans); letter-spacing: 0.02em; text-transform: uppercase; }
  select { padding: var(--space-3) var(--space-4); background: var(--surface-0); color: var(--text-strong); border: 1px solid var(--border-control); border-radius: var(--radius-md); font: var(--text-md) var(--font-sans); }
  select:focus-visible { outline: none; border-color: var(--accent); }
  .log { display: grid; margin: 0; padding: 0; list-style: none; }
  .entry { display: flex; align-items: flex-start; gap: var(--space-4); padding: var(--space-3) 0; border-bottom: 1px solid var(--border-subtle); }
  .text { flex: 1; min-width: 0; display: grid; gap: var(--space-1); }
  .text p { margin: 0; color: var(--text-normal); font: var(--text-sm) var(--font-sans); overflow-wrap: anywhere; }
  .text strong { color: var(--text-strong); font-weight: 600; }
  .reason { color: var(--text-secondary); }
  time { flex: none; color: var(--text-secondary); font: var(--text-xs) var(--font-sans); font-variant-numeric: tabular-nums; }
  .more { min-height: 2rem; margin: 0; padding: var(--space-3) 0; text-align: center; color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
</style>
