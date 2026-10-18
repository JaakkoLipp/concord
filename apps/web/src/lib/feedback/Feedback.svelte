<script lang="ts">
  import { untrack } from 'svelte';
  import { Button } from '@concord/ui';
  import type { Feedback, Session } from '@concord/domain';
  import { app } from '$lib/session/app.svelte.ts';
  import { m } from '$lib/i18n/index.ts';
  import { fullDate, shortDate } from '$lib/markdown/time.ts';
  import { toasts } from '$lib/view/toast.svelte.ts';

  let { session }: { session: Session } = $props();
  let rows = $state<Feedback[] | null>(null);
  let failed = $state(false);
  let closed = $state(false);
  let loading = $state(false);
  let busy = $state<string | null>(null);
  let request = 0;

  async function load() {
    const layer = app.layer;
    if (!layer) return;
    const current = ++request;
    loading = true;
    try {
      const result = await layer.feedback(closed);
      if (current === request) { rows = result; failed = false; }
    } catch {
      if (current === request) failed = true;
    } finally {
      if (current === request) loading = false;
    }
  }
  $effect(() => {
    void app.layer;
    void closed;
    untrack(() => void load());
  });

  async function close(row: Feedback) {
    const layer = app.layer;
    if (!layer || busy) return;
    busy = row.id;
    try {
      await layer.closeFeedback(row.id);
      await load();
    } catch {
      toasts.show(m.feedback.closeFailed);
    } finally {
      busy = null;
    }
  }
  const name = (id: string) => session.store.displayName(id) || id;
</script>

<p class="intro">{m.feedback.intro}</p>
<div class="toolbar">
  <label><input type="checkbox" bind:checked={closed} />{m.feedback.showClosed}</label>
  <Button size="sm" variant="secondary" busy={loading} onclick={load}>{m.feedback.refresh}</Button>
</div>
{#if failed}
  <p class="intro" role="alert">{m.feedback.loadFailed}</p>
{:else if loading}
  <p class="intro" role="status">{m.app.loading}</p>
{:else if rows && !rows.length}
  <p class="intro">{closed ? m.feedback.emptyAll : m.feedback.empty}</p>
{:else if rows}
  <ul>
    {#each rows as row (row.id)}
      <li>
        <div class="head">
          <strong>{row.title}</strong>
          <span class="kind">{m.feedback.kinds[row.kind]}</span>
          <time datetime={new Date(row.createdAt).toISOString()} title={fullDate(new Date(row.createdAt))}>{shortDate(new Date(row.createdAt))}</time>
        </div>
        <p class="by">{m.reports.by(name(row.reporter))}</p>
        <p class="description">{row.description}</p>
        {#if row.status === 'open'}
          <div><Button size="sm" variant="secondary" busy={busy === row.id} disabled={busy !== null} onclick={() => close(row)}>{m.feedback.close}</Button></div>
        {:else}
          <p class="by">{m.feedback.closed(row.closedBy ? name(row.closedBy) : '', row.closedAt ? shortDate(new Date(row.closedAt)) : '')}</p>
        {/if}
      </li>
    {/each}
  </ul>
{/if}

<style>
  .intro { margin: 0 0 var(--space-5); color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  .toolbar { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); margin-bottom: var(--space-5); }
  label { display: flex; align-items: center; gap: var(--space-3); color: var(--text-normal); font: var(--text-sm) var(--font-sans); }
  input { accent-color: var(--accent); }
  ul { display: grid; gap: var(--space-4); margin: 0; padding: 0; list-style: none; }
  li { display: grid; gap: var(--space-3); padding: var(--space-4); border: 1px solid var(--border-default); border-radius: var(--radius-md); background: var(--surface-1); min-width: 0; }
  .head { display: flex; align-items: baseline; gap: var(--space-3); flex-wrap: wrap; }
  strong { color: var(--text-strong); font: 600 var(--text-md) var(--font-sans); overflow-wrap: anywhere; }
  .kind { padding: 0 var(--space-2); border-radius: var(--radius-xs); background: var(--surface-5); color: var(--text-strong); font: 500 var(--text-xs) var(--font-sans); }
  time { margin-left: auto; color: var(--text-secondary); font: var(--text-xs) var(--font-sans); }
  p { margin: 0; }
  .by { color: var(--text-secondary); font: var(--text-sm) var(--font-sans); overflow-wrap: anywhere; }
  .description { color: var(--text-normal); font: var(--text-sm) var(--font-sans); white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
