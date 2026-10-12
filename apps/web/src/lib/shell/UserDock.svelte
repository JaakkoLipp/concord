<script lang="ts">
  import { Avatar, Button, IconButton, Popover } from '@concord/ui';
  import type { Store } from '@concord/domain';
  import Headphones from '@lucide/svelte/icons/headphones';
  import Mic from '@lucide/svelte/icons/mic';
  import Settings from '@lucide/svelte/icons/settings';
  import { m } from '$lib/i18n/index.ts';
  import { app } from '$lib/session/app.svelte.ts';
  import { avatarUrl, presenceOf } from '$lib/view/users.ts';

  let { store }: { store: Store } = $props();
  const self = $derived(store.self);
  let anchor = $state<HTMLButtonElement | null>(null);
  let open = $state(false);
</script>

{#if self}
  <section class="dock" aria-label={m.shell.you}>
    <button class="me" bind:this={anchor} onclick={() => (open = !open)} aria-haspopup="dialog" aria-expanded={open}>
      <Avatar src={avatarUrl(self)} size={32} presence={presenceOf(self)} presenceLabel={m.presence[presenceOf(self)]} />
      <span class="text">
        <span class="name">{self.displayName ?? self.username}</span>
        <span class="sub">{self.statusText ?? `${self.username}#${self.discriminator}`}</span>
      </span>
    </button>
    <IconButton label={m.shell.voiceLater} disabled><Mic /></IconButton>
    <IconButton label={m.shell.voiceLater} disabled><Headphones /></IconButton>
    <IconButton label={m.shell.settingsLater} disabled><Settings /></IconButton>
  </section>
  <Popover {anchor} {open} onclose={() => (open = false)} side="top" label={m.shell.you}>
    <div class="menu">
      <p class="tag">{self.username}#{self.discriminator}</p>
      <p class="connection">{m.session.connection[store.connection]}</p>
      <Button variant="secondary" size="sm" wide onclick={() => app.signOut()}>{m.session.logout}</Button>
    </div>
  </Popover>
{/if}

<style>
  .dock {
    display: flex; align-items: center; gap: var(--space-1); min-height: var(--dock-h); margin: var(--space-3);
    padding: var(--space-2) var(--space-3) var(--space-2) var(--space-2);
    border: 1px solid var(--border-default); border-radius: var(--radius-lg); background: var(--surface-1);
  }
  .me {
    display: flex; align-items: center; gap: var(--space-3); flex: 1; min-width: 0; padding: var(--space-1) var(--space-2);
    background: none; border: 0; border-radius: var(--radius-md); text-align: left;
  }
  .me:hover { background: var(--hover-overlay); }
  .text { display: grid; min-width: 0; }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-strong); font: 500 var(--text-sm) var(--font-sans); }
  .sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary); font: var(--text-xs) var(--font-sans); }
  .menu { display: grid; gap: var(--space-3); width: 15rem; padding: var(--space-4); }
  .menu p { margin: 0; }
  .tag { color: var(--text-strong); font: 500 var(--text-sm) var(--font-sans); }
  .connection { color: var(--text-secondary); font: var(--text-xs) var(--font-sans); }
</style>
