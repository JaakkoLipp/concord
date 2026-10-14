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
  import ImageViewer from '$lib/conversation/ImageViewer.svelte';
  import Toaster from './Toaster.svelte';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import ContextMenuHost from './ContextMenuHost.svelte';
  import EmojiPicker from '$lib/emoji/EmojiPicker.svelte';
  import AdminDialogs from '$lib/admin/AdminDialogs.svelte';
  import MemberRolesDialog from '$lib/admin/MemberRolesDialog.svelte';
  import ModerationDialogs from '$lib/admin/ModerationDialogs.svelte';
  import { app } from '$lib/session/app.svelte.ts';

  interface Props { store: Store; server: string | null; channel: string | null; children: Snippet; panel?: Snippet | undefined; panelWidth?: 'members' | 'profile' | 'find' }
  let { store, server, channel, children, panel, panelWidth = 'members' }: Props = $props();
</script>

<div class="shell" class:panel={!!panel && shell.panelOpen} class:sidebar-open={shell.sidebarOpen} style:--panel-w={panelWidth === 'profile' ? 'var(--dm-panel-w)' : panelWidth === 'find' ? 'var(--popout-w)' : 'var(--members-w)'}>
  <div class="rail"><ServerRail {store} active={server} /></div>
  <div class="sidebar">
    {#if server}
      <ChannelSidebar {store} {server} active={channel} />
    {:else}
      <DmSidebar {store} active={channel} />
    {/if}
  </div>
  <div class="dock"><UserDock {store} /></div>
  <main class="main">{@render children()}</main>
  {#if panel && shell.panelOpen}
    <div class="side-panel">{@render panel()}</div>
  {/if}
  <ImageViewer />
  <Toaster />
  <EmojiPicker />
  <ConfirmDialog />
  <ContextMenuHost />
  {#if app.session}<AdminDialogs session={app.session} /><MemberRolesDialog session={app.session} /><ModerationDialogs session={app.session} />{/if}
  {#if shell.sidebarOpen}
    <button class="scrim" aria-label={m.shell.closeSidebar} onclick={() => (shell.sidebarOpen = false)}></button>
  {/if}
</div>

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
  .dock { grid-area: dock; }
  .main { grid-area: main; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
  .side-panel { grid-area: panel; min-height: 0; border-left: 1px solid var(--border-subtle); background: var(--surface-0); }
  .scrim { display: none; }

  @media (max-width: 1100px) {
    .shell.panel { grid-template-columns: var(--rail-w) var(--sidebar-w) minmax(0, 1fr); grid-template-areas: 'rail sidebar main' 'dock dock main'; }
    .side-panel { position: fixed; z-index: 40; top: var(--header-h); right: 0; bottom: 0; width: var(--panel-w); box-shadow: var(--shadow-popover); }
  }
  @media (max-width: 700px) {
    .shell, .shell.panel { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); grid-template-areas: 'main'; }
    .rail, .sidebar, .dock { position: fixed; z-index: 50; translate: -100% 0; transition: translate var(--dur-modal) var(--ease-out); background: var(--surface-0); }
    .sidebar { translate: calc(-100% - var(--rail-w)) 0; }
    .rail { top: 0; bottom: var(--dock-h); left: 0; width: var(--rail-w); padding-bottom: var(--space-5); }
    .sidebar { top: 0; bottom: calc(var(--dock-h) + var(--space-5)); left: var(--rail-w); width: min(var(--sidebar-w), calc(100vw - var(--rail-w) - 3rem)); }
    .dock { bottom: 0; left: 0; width: min(calc(var(--rail-w) + var(--sidebar-w)), calc(100vw - 3rem)); }
    .sidebar-open .rail, .sidebar-open .sidebar, .sidebar-open .dock { translate: 0 0; }
    .scrim { display: block; position: fixed; inset: 0; z-index: 45; border: 0; background: var(--scrim); }
    .side-panel { top: var(--header-h); width: min(var(--panel-w), 85vw); }
  }
</style>
