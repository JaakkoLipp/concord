<script lang="ts">
  import { Avatar, Button, IconButton, Popover, Presence } from '@concord/ui';
  import type { Presence as PresenceName, Store } from '@concord/domain';
  import Headphones from '@lucide/svelte/icons/headphones';
  import Mic from '@lucide/svelte/icons/mic';
  import Settings from '@lucide/svelte/icons/settings';
  import { m } from '$lib/i18n/index.ts';
  import { app } from '$lib/session/app.svelte.ts';
  import { toasts } from '$lib/view/toast.svelte.ts';
  import { avatarUrl, presenceOf } from '$lib/view/users.ts';
  import CustomStatus from './CustomStatus.svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';

  let { store }: { store: Store } = $props();
  const self = $derived(store.self);
  let anchor = $state<HTMLButtonElement | null>(null);
  let open = $state(false);
  let custom = $state(false);

  const CHOICES: { presence: PresenceName; dot: 'online' | 'idle' | 'busy' | 'focus' | 'offline' }[] = [
    { presence: 'Online', dot: 'online' }, { presence: 'Idle', dot: 'idle' }, { presence: 'Busy', dot: 'busy' },
    { presence: 'Focus', dot: 'focus' }, { presence: 'Invisible', dot: 'offline' },
  ];
  /** What the menu shows as chosen: the saved choice, which Stoat's own data can't tell for Invisible. */
  const chosen = $derived(store.chosenStatus ?? self?.presence ?? 'Online');

  function choose(presence: PresenceName) {
    open = false;
    void app.session?.setStatus(presence).catch(() => toasts.show(m.status.failed));
  }
</script>

{#if self}
  <section class="dock" aria-label={m.shell.you}>
    <button class="me" bind:this={anchor} onclick={() => (open = !open)} aria-haspopup="dialog" aria-expanded={open}>
      <Avatar src={avatarUrl(self)} size={32} presence={presenceOf(self)} presenceLabel={m.presence[presenceOf(self)]} />
      <span class="text">
        <span class="name">{self.displayName ?? self.username}</span>
        <span class="sub">{self.statusText || `${self.username}#${self.discriminator}`}</span>
      </span>
    </button>
    <IconButton label={m.shell.voiceLater} disabled><Mic /></IconButton>
    <IconButton label={m.shell.voiceLater} disabled><Headphones /></IconButton>
    <IconButton label={m.settings.open} onclick={() => void goto(resolve('/(app)/app/settings/[section]', { section: 'profile' }))}><Settings /></IconButton>
  </section>
  <Popover {anchor} {open} onclose={() => (open = false)} side="top" label={m.shell.you}>
    <div class="menu">
      <p class="tag">{self.username}#{self.discriminator}</p>
      <div class="statuses" role="radiogroup" aria-label={m.status.label}>
        {#each CHOICES as c (c.presence)}
          <button role="radio" aria-checked={chosen === c.presence} class:checked={chosen === c.presence} onclick={() => choose(c.presence)}>
            <Presence state={c.dot} size={10} />
            <span class="choice">
              <span class="choice-name">{m.status.choices[c.presence].name}</span>
              {#if m.status.choices[c.presence].help}<span class="choice-help">{m.status.choices[c.presence].help}</span>{/if}
            </span>
          </button>
        {/each}
      </div>
      <div class="custom">
        <button onclick={() => { open = false; custom = true; }}>{self.statusText ? m.status.editCustom : m.status.setCustom}</button>
        {#if self.statusText}
          <button onclick={() => { open = false; void app.session?.setStatusText(null).catch(() => toasts.show(m.status.failed)); }}>{m.status.clear}</button>
        {/if}
      </div>
      <p class="connection">{m.session.connection[store.connection]}</p>
      <Button variant="secondary" size="sm" wide onclick={() => app.signOut()}>{m.session.logout}</Button>
    </div>
  </Popover>
  {#if app.session}<CustomStatus session={app.session} open={custom} onclose={() => (custom = false)} />{/if}
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
  .menu { display: grid; gap: var(--space-3); width: 17rem; padding: var(--space-4); }
  .statuses, .custom { display: grid; gap: var(--space-1); padding-top: var(--space-3); border-top: 1px solid var(--border-default); }
  .statuses button, .custom button {
    display: flex; align-items: center; gap: var(--space-4); min-height: 2.25rem; padding: var(--space-2) var(--space-3);
    border: 0; border-radius: var(--radius-md); background: none; color: var(--text-normal); text-align: left; font: 500 var(--text-sm) var(--font-sans);
  }
  .statuses button:hover, .custom button:hover { background: var(--hover-overlay); color: var(--text-strong); }
  .statuses button.checked { background: var(--surface-5); color: var(--text-strong); }
  .choice { display: grid; }
  .choice-help { color: var(--text-secondary); font: var(--text-xs) var(--font-sans); }
  .menu p { margin: 0; }
  .tag { color: var(--text-strong); font: 500 var(--text-sm) var(--font-sans); }
  .connection { color: var(--text-secondary); font: var(--text-xs) var(--font-sans); }
</style>
