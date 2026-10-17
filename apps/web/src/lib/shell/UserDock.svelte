<script lang="ts">
  import { Avatar, Button, IconButton, Menu, Popover, Presence, type MenuItem } from '@concord/ui';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import { deviceOptions } from '$lib/settings/devices.ts';
  import { listDevices, maxOutputVolume, outputSelectable } from '$lib/voice/audio/output.ts';
  import { loadVoiceSettings, saveVoiceSettings } from '$lib/voice/settings.ts';
  import { matches } from '$lib/voice/keybinds.ts';
  import type { Presence as PresenceName, Store } from '@concord/domain';
  import Headphones from '@lucide/svelte/icons/headphones';
  import HeadphoneOff from '@lucide/svelte/icons/headphone-off';
  import Mic from '@lucide/svelte/icons/mic';
  import MicOff from '@lucide/svelte/icons/mic-off';
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

  // Quick voice controls (m4.5-plan.md task 4): a device, volume and settings menu beside the microphone and the
  // headphones. A running call follows the saved settings at once.
  let options = $state<{ items: MenuItem[]; anchor: HTMLElement } | null>(null);
  async function openOptions(kind: 'input' | 'output', anchor: HTMLElement) {
    if (options?.anchor === anchor) return void (options = null);
    const s = loadVoiceSettings();
    const t = m.settings.voice;
    const items: MenuItem[] = [];
    if (kind === 'input' || outputSelectable()) {
      const list = await listDevices(kind === 'input' ? 'audioinput' : 'audiooutput');
      const chosen = kind === 'input' ? s.inputDevice : s.outputDevice;
      for (const o of deviceOptions(list)) {
        items.push({ kind: 'check', label: o.label, checked: o.id === chosen, onselect: () => saveVoiceSettings(kind === 'input' ? { inputDevice: o.id } : { outputDevice: o.id }) });
      }
      items.push('separator');
    }
    items.push(kind === 'input'
      ? { kind: 'range', label: t.inputVolume, value: s.inputVolume, min: 0, max: 200, format: t.percent, oninput: (v) => saveVoiceSettings({ inputVolume: v }) }
      : { kind: 'range', label: t.outputVolume, value: s.outputVolume, min: 0, max: maxOutputVolume(), format: t.percent, oninput: (v) => saveVoiceSettings({ outputVolume: v }) });
    items.push('separator', { label: m.voice.voiceSettings, onselect: () => void goto(resolve('/(app)/app/settings/[section]', { section: 'voice' })) });
    options = { items, anchor };
  }

  /** The mute and deafen keybinds from Voice and video settings, Ctrl+Shift+M and Ctrl+Shift+D unless changed. */
  function shortcut(e: KeyboardEvent) {
    const voice = app.voice;
    if (!voice || e.repeat) return;
    const s = loadVoiceSettings();
    if (matches(s.muteKey, e)) voice.toggleMute();
    else if (matches(s.deafenKey, e)) voice.toggleDeafen();
    else return;
    e.preventDefault();
  }

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
    {#if app.voice}
      {@const voice = app.voice}
      <!-- Mute and deafen work outside a call too, and apply at the next join (client.md section 10.3). -->
      <span class="toggle" class:on={voice.muted || !!voice.micLock} class:locked={!!voice.micLock}>
        <IconButton label={voice.micLock ?? (voice.muted ? m.voice.unmute : m.voice.mute)} aria-disabled={!!voice.micLock} onclick={() => voice.toggleMute()}>
          {#if voice.muted || voice.micLock}<MicOff />{:else}<Mic />{/if}
        </IconButton>
        <button class="chevron" aria-label={m.voice.inputOptions} aria-haspopup="menu" aria-expanded={!!options && options.anchor.dataset.kind === 'input'} data-kind="input"
          onclick={(e) => void openOptions('input', e.currentTarget)}><ChevronDown /></button>
      </span>
      <span class="toggle" class:on={voice.deafened || voice.serverDeafened} class:locked={voice.serverDeafened}>
        <IconButton label={voice.serverDeafened ? m.voiceMod.youServerDeafened : voice.deafened ? m.voice.undeafen : m.voice.deafen} aria-disabled={voice.serverDeafened} onclick={() => voice.toggleDeafen()}>
          {#if voice.deafened || voice.serverDeafened}<HeadphoneOff />{:else}<Headphones />{/if}
        </IconButton>
        <button class="chevron" aria-label={m.voice.outputOptions} aria-haspopup="menu" aria-expanded={!!options && options.anchor.dataset.kind === 'output'} data-kind="output"
          onclick={(e) => void openOptions('output', e.currentTarget)}><ChevronDown /></button>
      </span>
    {/if}
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
  <Menu open={!!options} onclose={() => (options = null)} items={options?.items ?? []} anchor={options?.anchor ?? null} label={m.voice.voiceSettings} />
{/if}
<svelte:window onkeydown={shortcut} />

<style>
  .dock {
    /* Inside the shell's dock panel, which draws the box. */
    display: flex; align-items: center; gap: var(--space-1); min-height: calc(var(--dock-h) - 2px);
    padding: var(--space-2) var(--space-3) var(--space-2) var(--space-2);
  }
  .me {
    display: flex; align-items: center; gap: var(--space-3); flex: 1; min-width: 0; padding: var(--space-1) var(--space-2);
    background: none; border: 0; border-radius: var(--radius-md); text-align: left;
  }
  @media (hover: hover) { .me:hover { background: var(--hover-overlay); } }
  .text { display: grid; min-width: 0; }
  /* The button and its menu's chevron, side by side as on Discord. */
  .toggle { display: flex; align-items: center; }
  .toggle.on :global(.icon-button) { color: var(--danger); }
  /* Held by a moderator: still announced and focusable, but it does nothing. */
  .toggle.locked :global(.icon-button) { cursor: not-allowed; }
  .chevron {
    display: grid; place-items: center; width: 1rem; height: 2rem; margin-left: calc(-1 * var(--space-1)); padding: 0;
    border: 0; border-radius: var(--radius-xs); background: none; color: var(--text-secondary);
  }
  .chevron :global(svg) { width: 0.875rem; height: 0.875rem; }
  @media (hover: hover) { .chevron:hover { background: var(--hover-overlay); color: var(--text-strong); } }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-strong); font: 500 var(--text-sm) var(--font-sans); }
  .sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary); font: var(--text-xs) var(--font-sans); }
  .menu { display: grid; gap: var(--space-3); width: 17rem; padding: var(--space-4); }
  .statuses, .custom { display: grid; gap: var(--space-1); padding-top: var(--space-3); border-top: 1px solid var(--border-default); }
  .statuses button, .custom button {
    display: flex; align-items: center; gap: var(--space-4); min-height: 2.25rem; padding: var(--space-2) var(--space-3);
    border: 0; border-radius: var(--radius-md); background: none; color: var(--text-normal); text-align: left; font: 500 var(--text-sm) var(--font-sans);
  }
  @media (hover: hover) { .statuses button:hover, .custom button:hover { background: var(--hover-overlay); color: var(--text-strong); } }
  .statuses button.checked { background: var(--surface-5); color: var(--text-strong); }
  .choice { display: grid; }
  .choice-help { color: var(--text-secondary); font: var(--text-xs) var(--font-sans); }
  .menu p { margin: 0; }
  .tag { color: var(--text-strong); font: 500 var(--text-sm) var(--font-sans); }
  .connection { color: var(--text-secondary); font: var(--text-xs) var(--font-sans); }
</style>
