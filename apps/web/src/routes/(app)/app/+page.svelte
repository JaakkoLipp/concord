<script lang="ts">
  import { Avatar, Button, Presence } from '@concord/ui';
  import { m } from '$lib/i18n/index.ts';
  import { app } from '$lib/session/app.svelte.ts';
  import { avatarUrl, presenceOf } from '$lib/view/users.ts';

  const store = $derived(app.session?.store);
  const self = $derived(store?.self);
</script>

<!-- Temporary signed-in page until the shell lands in task 5. -->
<main class="page">
  {#if store && self}
    <div class="who">
      <Avatar src={avatarUrl(self)} size={40} presence={presenceOf(self)} />
      <span>{m.session.signedInAs(self.displayName ?? self.username)}</span>
    </div>
    <p class="state"><Presence state={store.connection === 'ready' ? 'online' : 'idle'} /> {m.session.connection[store.connection]}</p>
    <p>{m.app.backendVersion(store.node?.version ?? '…')}</p>
    <Button variant="secondary" onclick={() => app.signOut()}>{m.session.logout}</Button>
  {/if}
</main>

<style>
  .page { display: grid; place-content: center; gap: var(--space-5); min-height: 100dvh; justify-items: center; }
  .who { display: flex; align-items: center; gap: var(--space-4); color: var(--text-strong); font: 500 var(--text-md) var(--font-sans); }
  .state { display: flex; align-items: center; gap: var(--space-3); color: var(--text-secondary); margin: 0; }
</style>
