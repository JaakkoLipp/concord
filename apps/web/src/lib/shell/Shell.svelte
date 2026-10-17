<script lang="ts">
  /**
   * The four-column layout (client.md section 5): rail, sidebar, conversation, and member list or profile
   * panel, with the user dock across the first two columns. Below 1100 px the panel overlays the
   * conversation; below 700 px the rail and sidebar become a slide-over.
   */
  import type { Store } from '@concord/domain';
  import type { Snippet } from 'svelte';
  import { m } from '$lib/i18n/index.ts';
  import { shell } from '$lib/view/shell.svelte.ts';
  import ChannelSidebar from './ChannelSidebar.svelte';
  import DmSidebar from './DmSidebar.svelte';
  import ServerRail from './ServerRail.svelte';
  import UserDock from './UserDock.svelte';
  import VoicePanel from './VoicePanel.svelte';
  import IncomingCalls from './IncomingCalls.svelte';
  import ImageViewer from '$lib/conversation/ImageViewer.svelte';
  import Toaster from './Toaster.svelte';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import ShortcutsDialog from './ShortcutsDialog.svelte';
  import MentionsPanel from './MentionsPanel.svelte';
  import QuickSwitcher from './QuickSwitcher.svelte';
  import { handle as handleShortcut } from './shortcuts.ts';
  import './navShortcuts.ts';
  import './switcherShortcut.ts';
  import { typeToFocus } from './typeToFocus.ts';
  import ContextMenuHost from './ContextMenuHost.svelte';
  import EmojiPicker from '$lib/emoji/EmojiPicker.svelte';
  import AdminDialogs from '$lib/admin/AdminDialogs.svelte';
  import MemberRolesDialog from '$lib/admin/MemberRolesDialog.svelte';
  import ModerationDialogs from '$lib/admin/ModerationDialogs.svelte';
  import MemberNicknameDialog from '$lib/admin/MemberNicknameDialog.svelte';
  import ModerationPanel from '$lib/admin/ModerationPanel.svelte';
  import NotifySettingsDialog from '$lib/notify/NotifySettingsDialog.svelte';
  import ServerProfileDialog from '$lib/admin/ServerProfileDialog.svelte';
  import NotifyBar from '$lib/notify/NotifyBar.svelte';
  import { app } from '$lib/session/app.svelte.ts';
  import { moderationView } from '$lib/admin/moderation.svelte.ts';
  import { settingsModal } from '$lib/settings/modal.svelte.ts';

  interface Props {
    store: Store; server: string | null; channel: string | null; children: Snippet; panel?: Snippet | undefined; panelWidth?: 'members' | 'profile' | 'find' | 'chat';
    /** Whether the panel shows, when not the member list's own toggle: a voice channel's chat has its own. */
    panelOpen?: boolean | undefined;
  }
  let { store, server, channel, children, panel, panelWidth = 'members', panelOpen }: Props = $props();
  const open = $derived(panelOpen ?? shell.panelOpen);
  const NO_ONE: ReadonlySet<string> = new Set();
  /** The voice panel's height, so the slide-over sidebar ends above it on narrow screens. */
  let voiceHeight = $state(0);
</script>

<!-- The one keyboard listener for the registry's shortcuts (shortcuts.ts). Capture phase, so the composer's editor doesn't win. -->
<!-- Under settings the shell is inert, and its shortcuts and type-to-focus wait (m4.6-plan.md task 16a). -->
<svelte:window onkeydowncapture={(e) => !settingsModal.shown && (handleShortcut(e) || typeToFocus(e))} />
<div class="shell" inert={!!settingsModal.shown} style:--voice-h="{voiceHeight}px" class:panel={!!(panel || moderationView.current) && open} class:sidebar-open={shell.sidebarOpen} class:chat-panel={panelWidth === 'chat' && !moderationView.current} style:--panel-w={moderationView.current ? 'var(--members-w)' : panelWidth === 'profile' ? 'var(--dm-panel-w)' : panelWidth === 'find' || panelWidth === 'chat' ? 'var(--side-panel-w)' : 'var(--members-w)'}>
  <div class="rail"><ServerRail {store} active={server} /></div>
  <div class="sidebar">
    {#if server}
      <ChannelSidebar {store} {server} active={channel} speaking={app.voice?.speaking ?? NO_ONE} />
    {:else}
      <DmSidebar {store} active={channel} />
    {/if}
  </div>
  <div class="dock">
    <div class="dock-panel">
      {#if app.voice}<div bind:offsetHeight={voiceHeight}><VoicePanel {store} voice={app.voice} calling={app.rings?.calling ?? false} /></div>{/if}
      <UserDock {store} />
    </div>
  </div>
  <main class="main">{@render children()}</main>
  {#if moderationView.current && open && app.session}
    <div class="side-panel"><ModerationPanel session={app.session} {store} /></div>
  {:else if panel && open}
    <div class="side-panel">{@render panel()}</div>
  {/if}
  {#if shell.sidebarOpen}
    <button class="scrim" aria-label={m.shell.closeSidebar} onclick={() => (shell.sidebarOpen = false)}></button>
  {/if}
</div>
<!-- The overlays sit outside the shell, so they stay usable over settings while the shell is inert. -->
<ImageViewer />
<Toaster />
<EmojiPicker />
<ConfirmDialog />
<ShortcutsDialog />
<QuickSwitcher />
{#if app.session}<MentionsPanel session={app.session} />{/if}
<ContextMenuHost />
{#if app.session}<AdminDialogs session={app.session} /><MemberRolesDialog session={app.session} /><ModerationDialogs session={app.session} /><MemberNicknameDialog session={app.session} /><NotifySettingsDialog session={app.session} /><ServerProfileDialog session={app.session} />{/if}
<NotifyBar />
{#if app.rings}<IncomingCalls {store} rings={app.rings} />{/if}

<style>
  .shell {
    display: grid; height: 100dvh;
    grid-template-columns: var(--rail-w) var(--sidebar-w) minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) auto;
    grid-template-areas: 'rail sidebar main' 'dock dock main';
  }
  .shell.panel { grid-template-columns: var(--rail-w) var(--sidebar-w) minmax(0, 1fr) var(--panel-w); grid-template-areas: 'rail sidebar main panel' 'dock dock main panel'; }
  .rail { grid-area: rail; display: flex; min-height: 0; }
  .rail > :global(*) { flex: 1; }
  .sidebar {
    grid-area: sidebar; display: flex; flex-direction: column; min-height: 0;
    border: 1px solid var(--border-subtle); border-width: 0 1px 0 1px; border-top-left-radius: var(--radius-lg);
  }
  /* The voice panel and the user dock share one panel, as on Discord. It ends level with the composer. */
  .dock { grid-area: dock; padding: var(--space-3); }
  .dock-panel { border: 1px solid var(--border-default); border-radius: var(--radius-md); background: var(--surface-1); overflow: hidden; }
  .main { grid-area: main; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
  .side-panel { grid-area: panel; min-height: 0; border-left: 1px solid var(--border-subtle); background: var(--surface-0); }
  .scrim { display: none; }

  /* A voice channel's chat sits beside the stage only where that leaves the stage about 560 px; narrower, it overlays it. */
  @media (max-width: 1360px) {
    .shell.panel.chat-panel { grid-template-columns: var(--rail-w) var(--sidebar-w) minmax(0, 1fr); grid-template-areas: 'rail sidebar main' 'dock dock main'; }
    .chat-panel .side-panel { position: fixed; z-index: 40; top: var(--header-h); right: 0; bottom: 0; width: min(var(--panel-w), 85vw); box-shadow: var(--shadow-popover); }
  }
  @media (max-width: 1100px) {
    .shell.panel { grid-template-columns: var(--rail-w) var(--sidebar-w) minmax(0, 1fr); grid-template-areas: 'rail sidebar main' 'dock dock main'; }
    .side-panel { position: fixed; z-index: 40; top: var(--header-h); right: 0; bottom: 0; width: var(--panel-w); box-shadow: var(--shadow-popover); }
  }
  @media (max-width: 700px) {
    .shell, .shell.panel { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); grid-template-areas: 'main'; }
    .rail, .sidebar, .dock { position: fixed; z-index: 50; translate: -100% 0; transition: translate calc(var(--dur-modal) * var(--motion)) var(--ease-in-out); background: var(--surface-0); }
    .sidebar { translate: calc(-100% - var(--rail-w)) 0; }
    .rail { top: 0; bottom: calc(var(--dock-h) + var(--voice-h)); left: 0; width: var(--rail-w); padding-bottom: var(--space-5); }
    .sidebar { top: 0; bottom: calc(var(--dock-h) + var(--voice-h) + var(--space-5)); left: var(--rail-w); width: min(var(--sidebar-w), calc(100vw - var(--rail-w) - 3rem)); }
    .dock { bottom: 0; left: 0; width: min(calc(var(--rail-w) + var(--sidebar-w)), calc(100vw - 3rem)); }
    .sidebar-open .rail, .sidebar-open .sidebar, .sidebar-open .dock { translate: 0 0; }
    .scrim { display: block; position: fixed; inset: 0; z-index: 45; border: 0; background: var(--scrim); }
    .side-panel { top: var(--header-h); width: min(var(--panel-w), 85vw); }
  }
</style>
