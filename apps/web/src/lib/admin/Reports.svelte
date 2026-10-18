<script lang="ts">
  /**
   * Reports (m4.7-plan.md task 9): a server's, in its settings for those with Manage messages, or the app's admins' own,
   * under Administration. Each says who and what was reported, why, by whom, and the message's text as it was. Closing
   * takes a note and does nothing else: the moderator uses the usual actions.
   */
  import { untrack } from 'svelte';
  import { resolve } from '$app/paths';
  import { Button } from '@concord/ui';
  import type { Report, ReportScope, Session } from '@concord/domain';
  import { m } from '$lib/i18n/index.ts';
  import { fullDate, shortDate } from '$lib/markdown/time.ts';
  import { app } from '$lib/session/app.svelte.ts';
  import { toasts } from '$lib/view/toast.svelte.ts';

  let { session, scope }: { session: Session; scope: ReportScope } = $props();
  const store = $derived(session.store);
  const server = $derived(scope === 'admin' ? undefined : scope.server);
  let reports = $state<Report[] | null>(null);
  let failed = $state(false);
  let closed = $state(false);
  let notes = $state<Record<string, string>>({});
  let busy = $state<string | null>(null);

  async function load() {
    const layer = app.layer;
    if (!layer) return;
    try {
      reports = await layer.reports(scope, closed);
      failed = false;
    } catch {
      failed = true;
    }
  }
  $effect(() => {
    void scope;
    void closed;
    untrack(() => void load());
  });

  const name = (id: string) => store.displayName(id, server);
  /** A link to the message, when this account can open its channel. */
  function jumpTo(r: Report): string | null {
    if (!r.channel || !r.message || !store.channels.has(r.channel)) return null;
    return r.server
      ? resolve('/(app)/app/channels/[server]/[channel]/[[message]]', { server: r.server, channel: r.channel, message: r.message })
      : resolve('/(app)/app/channels/@me/[channel]/[[message]]', { channel: r.channel, message: r.message });
  }

  async function close(r: Report) {
    const layer = app.layer;
    if (!layer || busy) return;
    busy = r.id;
    try {
      await layer.closeReport(r.id, (notes[r.id] ?? '').trim());
      await load();
    } catch {
      toasts.show(m.reports.closeFailed);
    } finally {
      busy = null;
    }
  }
</script>

<p class="intro">{scope === 'admin' ? m.reports.adminIntro : m.reports.intro}</p>
<label class="toggle"><input type="checkbox" bind:checked={closed} />{m.reports.showClosed}</label>
{#if failed}
  <p class="intro" role="alert">{m.reports.loadFailed}</p>
{:else if reports && !reports.length}
  <p class="intro">{m.reports.empty}</p>
{:else if reports}
  <ul class="reports">
    {#each reports as r (r.id)}
      {@const link = jumpTo(r)}
      <li class="report" class:closed={r.status === 'closed'}>
        <div class="head">
          <strong>{m.reports.about(name(r.reported))}</strong>
          <span class="reason">{m.reports.reasons[r.reason]}</span>
          <time datetime={new Date(r.createdAt).toISOString()} title={fullDate(new Date(r.createdAt))}>{shortDate(new Date(r.createdAt))}</time>
        </div>
        <p class="by">{m.reports.by(name(r.reporter))}</p>
        {#if r.notes}<p class="notes">{r.notes}</p>{/if}
        {#if r.kind === 'message'}
          {#if r.content !== null}
            <figure>
              <figcaption>{m.reports.evidence}</figcaption>
              <blockquote>{r.content}</blockquote>
            </figure>
          {:else}
            <p class="by">{m.reports.gone}</p>
          {/if}
          {#if link}<a href={link}>{m.reports.jump}</a>{/if}
        {/if}
        {#if r.status === 'open'}
          <div class="close">
            <input type="text" maxlength={500} aria-label={m.reports.closeNote} placeholder={m.reports.closeNote} bind:value={notes[r.id]} />
            <Button size="sm" variant="secondary" busy={busy === r.id} onclick={() => close(r)}>{m.reports.close}</Button>
          </div>
        {:else}
          <p class="by">{m.reports.closed(r.closedBy ? name(r.closedBy) : '', r.closedAt ? shortDate(new Date(r.closedAt)) : '')}{#if r.closeNote}: {r.closeNote}{/if}</p>
        {/if}
      </li>
    {/each}
  </ul>
{/if}

<style>
  .intro { margin: 0 0 var(--space-5); color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  .toggle { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-5); color: var(--text-normal); font: var(--text-sm) var(--font-sans); }
  .toggle input { accent-color: var(--accent); }
  .reports { display: grid; gap: var(--space-4); margin: 0; padding: 0; list-style: none; }
  .report { display: grid; gap: var(--space-2); padding: var(--space-4); border: 1px solid var(--border-default); border-radius: var(--radius-md); background: var(--surface-1); }
  .report.closed { opacity: 0.7; }
  .head { display: flex; align-items: baseline; gap: var(--space-3); flex-wrap: wrap; }
  .head strong { color: var(--text-strong); font: 600 var(--text-md) var(--font-sans); }
  .reason { padding: 0 var(--space-2); border-radius: var(--radius-xs); background: var(--surface-5); color: var(--text-strong); font: 500 var(--text-xs) var(--font-sans); }
  time { margin-left: auto; color: var(--text-secondary); font: var(--text-xs) var(--font-sans); font-variant-numeric: tabular-nums; }
  p { margin: 0; }
  .by { color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  .notes { color: var(--text-normal); font: var(--text-sm) var(--font-sans); overflow-wrap: anywhere; }
  figure { margin: 0; display: grid; gap: var(--space-1); }
  figcaption { color: var(--text-secondary); font: 700 var(--text-xs) var(--font-sans); }
  blockquote { margin: 0; padding: var(--space-2) var(--space-3); border-left: 3px solid var(--border-control); color: var(--text-normal); font: var(--text-sm) var(--font-sans); white-space: pre-wrap; overflow-wrap: anywhere; }
  a { color: var(--link); font: var(--text-sm) var(--font-sans); }
  .close { display: flex; gap: var(--space-3); }
  .close input { flex: 1; min-width: 0; padding: var(--space-2) var(--space-3); border: 1px solid var(--border-control); border-radius: var(--radius-md); background: var(--surface-0); color: var(--text-strong); font: var(--text-sm) var(--font-sans); }
  .close input:focus-visible { outline: none; border-color: var(--accent); }
</style>
