<script lang="ts">
  import { Button, Dialog } from '@concord/ui';
  import { m } from '$lib/i18n/index.ts';
  import { confirm } from '$lib/view/confirm.svelte.ts';
</script>

<Dialog open={!!confirm.current} title={confirm.current?.title ?? ''} onclose={() => confirm.answer(false)}>
  <p>{confirm.current?.body}</p>
  {#snippet actions()}
    <Button variant="ghost" onclick={() => confirm.answer(false)}>{m.friends.confirm.cancel}</Button>
    <Button variant={confirm.current?.danger ? 'danger' : 'primary'} onclick={() => confirm.answer(true)}>{confirm.current?.confirm}</Button>
  {/snippet}
</Dialog>
