<script lang="ts">
  import { Button, Dialog, TextField } from '@concord/ui';
  import { m } from '$lib/i18n/index.ts';
  import { confirm } from '$lib/view/confirm.svelte.ts';
</script>

<Dialog open={!!confirm.current} title={confirm.current?.title ?? ''} onclose={() => confirm.answer(false)}>
  <p>{confirm.current?.body}</p>
  {#if confirm.current?.typed}
    <div class="field"><TextField label={m.confirm.typeToConfirm(confirm.current.typed)} bind:value={confirm.typedValue} autocomplete="off" /></div>
  {/if}
  {#if confirm.current?.reason}
    <div class="field"><TextField label={m.confirm.reason} hint={m.confirm.reasonHint} bind:value={confirm.reasonValue} maxlength={512} /></div>
  {/if}
  {#snippet actions()}
    <Button variant="ghost" onclick={() => confirm.answer(false)}>{m.friends.confirm.cancel}</Button>
    <Button variant={confirm.current?.danger ? 'danger' : 'primary'} disabled={!confirm.ready} onclick={() => confirm.answer(true)}>{confirm.current?.confirm}</Button>
  {/snippet}
</Dialog>

<style>
  .field { margin-top: var(--space-4); }
</style>
