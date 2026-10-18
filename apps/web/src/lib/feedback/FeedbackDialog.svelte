<script lang="ts">
  import { Button, Dialog } from '@concord/ui';
  import { BackendError, type Feedback } from '@concord/domain';
  import { app } from '$lib/session/app.svelte.ts';
  import { m } from '$lib/i18n/index.ts';
  import { toasts } from '$lib/view/toast.svelte.ts';

  let { onclose }: { onclose: () => void } = $props();
  const uid = $props.id();
  let kind = $state<Feedback['kind']>('bug');
  let title = $state('');
  let description = $state('');
  let busy = $state(false);
  let error = $state('');
  const close = () => { if (!busy) onclose(); };

  async function send(event: SubmitEvent) {
    event.preventDefault();
    if (busy || !title.trim() || !description.trim()) return;
    const layer = app.layer;
    if (!layer) { error = m.feedback.failed; return; }
    busy = true;
    error = '';
    try {
      await layer.submitFeedback(kind, title.trim(), description.trim());
      toasts.show(m.feedback.sent, 'info');
      onclose();
    } catch (e) {
      error = e instanceof BackendError && e.kind === 'FeedbackLimit' ? m.feedback.limit
        : e instanceof BackendError && e.kind === 'RateLimited' ? m.feedback.rate
        : e instanceof BackendError && e.kind === 'InvalidText' ? m.feedback.invalid : m.feedback.failed;
    } finally {
      busy = false;
    }
  }
</script>

<Dialog open title={m.feedback.title} onclose={close} width="34rem">
  <p>{m.feedback.help}</p>
  <form id="feedback-{uid}" onsubmit={send}>
    <fieldset disabled={busy}>
      <label for="kind-{uid}">{m.feedback.kind}</label>
      <select id="kind-{uid}" bind:value={kind}>
        <option value="bug">{m.feedback.kinds.bug}</option>
        <option value="feedback">{m.feedback.kinds.feedback}</option>
      </select>
      <label for="title-{uid}">{m.feedback.subject}</label>
      <input id="title-{uid}" type="text" bind:value={title} maxlength={120} required />
      <label for="description-{uid}">{m.feedback.description}</label>
      <textarea id="description-{uid}" rows="6" bind:value={description} maxlength={4000} required aria-describedby="hint-{uid}"></textarea>
      <p id="hint-{uid}" class="hint">{m.feedback.hint}</p>
    </fieldset>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  </form>
  {#snippet actions()}
    <Button variant="ghost" disabled={busy} onclick={close}>{m.admin.cancel}</Button>
    <Button type="submit" form="feedback-{uid}" {busy} disabled={!title.trim() || !description.trim()}>{m.feedback.send}</Button>
  {/snippet}
</Dialog>

<style>
  fieldset { display: grid; gap: var(--space-2); padding: 0; margin: 0; border: 0; min-width: 0; }
  label { margin-top: var(--space-2); color: var(--text-strong); font: 500 var(--text-sm) var(--font-sans); }
  input, select, textarea {
    width: 100%; box-sizing: border-box; padding: var(--space-3); border: 1px solid var(--border-control); border-radius: var(--radius-md);
    background: var(--surface-0); color: var(--text-strong); font: var(--text-sm) var(--font-sans);
  }
  textarea { resize: vertical; min-height: 6rem; }
  input:focus-visible, select:focus-visible, textarea:focus-visible { outline: none; border-color: var(--accent); }
  .hint { color: var(--text-secondary); font: var(--text-xs) var(--font-sans); }
  .error { color: var(--danger); font: var(--text-sm) var(--font-sans); }
</style>
