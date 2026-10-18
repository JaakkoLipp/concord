<script lang="ts">
  /**
   * The call view (client.md section 10.3), in the conversation column of a voice channel: a grid with a tile for
   * each person and each screen share, a focused tile with the rest in a strip under it, and the call's controls.
   * Before joining, it shows who is in the channel and a Join button. Video comes from LiveKit through the voice
   * controller's feeds; who is in the channel comes from Stoat, as in the sidebar.
   */
  import { Avatar, Button, Menu, fadeIn, tooltip, type MenuItem } from '@concord/ui';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import ChevronUp from '@lucide/svelte/icons/chevron-up';
  import Maximize from '@lucide/svelte/icons/maximize';
  import { fileUrl } from '@concord/stoat';
  import { memberKey, type Id, type Session } from '@concord/domain';
  import Mic from '@lucide/svelte/icons/mic';
  import MicOff from '@lucide/svelte/icons/mic-off';
  import PhoneOff from '@lucide/svelte/icons/phone-off';
  import ScreenShare from '@lucide/svelte/icons/screen-share';
  import Users from '@lucide/svelte/icons/users';
  import Volume2 from '@lucide/svelte/icons/volume-2';
  import Video from '@lucide/svelte/icons/video';
  import VideoOff from '@lucide/svelte/icons/video-off';
  import { m } from '$lib/i18n/index.ts';
  import { callRights, channelName } from '$lib/view/channels.ts';
  import { avatarUrl } from '$lib/view/users.ts';
  import { popout } from '$lib/view/popout.svelte.ts';
  import { voiceMarks } from '$lib/shell/voice.ts';
  import type { Feed, FeedQuality } from '$lib/voice/call.ts';
  import { loadVoiceSettings, onVoiceSettings, saveVoiceSettings } from '$lib/voice/settings.ts';
  import StatsOverlay from './StatsOverlay.svelte';
  import type { VoiceController } from '$lib/voice/controller.svelte.ts';
  import CallTile from './CallTile.svelte';
  import { participantMenu, streamVolumeItem } from './menu.ts';
  import { streamVolumeKey } from '$lib/voice/settings.ts';
  import { shareDialog, stageView } from './share.svelte.ts';
  import { deviceMenu, shareMenu, type DeviceMenuKind } from '$lib/voice/quickMenus.ts';

  /** `compact`: at the top of a DM or group, above its messages, rather than filling the column. */
  let { session, voice, channel, compact = false }: { session: Session; voice: VoiceController; channel: Id; compact?: boolean } = $props();
  const muteLabel = $derived(voice.micLock ?? (voice.muted ? m.voice.unmute : m.voice.mute));
  const cameraLabel = $derived(voice.videoLock ?? (voice.camera ? m.voice.cameraOff : m.voice.cameraOn));
  const shareLabel = $derived(voice.videoLock ?? (voice.sharing ? m.voice.stopShare : m.voice.share));
  const store = $derived(session.store);
  const info = $derived(store.channels.get(channel));
  const server = $derived(info?.kind === 'text' ? info.server : undefined);
  const participants = $derived(store.voiceParticipants(channel));
  const here = $derived(voice.channel === channel && voice.status !== 'none' && voice.status !== 'disconnected');
  /** Before joining: this channel's own rights, which the controller only knows for the call it is in. */
  const rights = $derived(callRights(store, info));

  interface Tile { id: string; user: Id; feed?: Feed | undefined; screen: boolean }
  const tiles = $derived.by((): Tile[] => {
    const feeds = here ? voice.feeds : [];
    const camera = (user: Id) => feeds.find((f) => f.user === user && f.source === 'camera');
    // Everyone Stoat lists, then anyone LiveKit already has video from whom Stoat hasn't announced yet.
    const users = participants.map((v) => v.user);
    for (const f of feeds) if (!users.includes(f.user)) users.push(f.user);
    return [
      ...users.map((user) => ({ id: `user/${user}`, user, feed: camera(user), screen: false })),
      ...feeds.filter((f) => f.source === 'screen').map((f) => ({ id: f.id, user: f.user, feed: f, screen: true })),
    ];
  });
  let focusedId = $state<string | null>(null);

  // Only someone joining fades in: not the tiles there as the view opens, nor any tile on a switch between
  // grid and focus, which remounts them all (client.md section 9).
  const seen = new Set<string>();
  let settled = $state(false);
  $effect(() => {
    if (!here) { settled = false; seen.clear(); return; }
    const t = setTimeout(() => (settled = true), 1_000);
    return () => clearTimeout(t);
  });
  // Only those showing now: someone who leaves and comes back fades in again.
  $effect(() => { seen.clear(); for (const t of tiles) seen.add(t.id); });
  const appears = (id: string) => settled && !seen.has(id);
  const focused = $derived(tiles.find((t) => t.id === focusedId));
  const rest = $derived(focused ? tiles.filter((t) => t !== focused) : tiles);

  const avatar = (user: Id) => avatarUrl(store.users.get(user) ?? { id: user }, server ? store.members.get(memberKey(server, user))?.avatar : undefined);
  /** Muted as others see it, or as we know it ourselves before Stoat's flag arrives. */
  function isMuted(user: Id): boolean {
    if (user === store.selfId && here) return voice.muted;
    const v = participants.find((p) => p.user === user);
    if (!v) return false;
    const marks = voiceMarks(store, v, server);
    return marks.muted || marks.serverMuted;
  }

  /** Each remote share's quality cap, from its tile menu. Auto leaves the layer to the tile's size. */
  let qualities = $state<Record<string, FeedQuality>>({});
  const QUALITIES: FeedQuality[] = ['auto', '1080p', '720p', '360p'];
  /** The stats overlay over screen shares, a device setting. */
  let overlay = $state(loadVoiceSettings().statsOverlay);
  $effect(() => onVoiceSettings((s) => (overlay = s.statsOverlay)));

  // Watching a stream (m4.6-plan.md task 12b): the stage's header names it and shows what arrives, read each second
  // from the stats the overlay already uses.
  const stream = $derived(focused?.screen && focused.feed?.watching ? focused.feed : undefined);
  let streamStats = $state<{ width: number; height: number; fps: number } | null>(null);
  $effect(() => {
    const f = stream;
    streamStats = null;
    if (!f) return;
    let live = true;
    const read = async () => {
      const s = await f.stats();
      if (!live) return;
      const top = s?.sharer?.layers.reduce<(typeof s.sharer.layers)[number] | undefined>((a, l) => (!a || l.width > a.width ? l : a), undefined);
      streamStats = s?.viewer ? { width: s.viewer.width, height: s.viewer.height, fps: s.viewer.fps } : top ? { width: top.width, height: top.height, fps: top.fps } : null;
    };
    void read();
    const timer = setInterval(() => void read(), 1000);
    return () => { live = false; clearInterval(timer); };
  });

  /** The quick menus behind the bar's chevrons. */
  let quick = $state<{ items: MenuItem[]; anchor: HTMLElement } | null>(null);
  async function openQuick(kind: DeviceMenuKind | 'share', anchor: HTMLElement) {
    if (quick?.anchor === anchor) return void (quick = null);
    quick = { items: kind === 'share' ? shareMenu(voice) : await deviceMenu(kind), anchor };
  }
  let mainTile = $state<HTMLElement | null>(null);
  function fullscreenFocused() {
    void mainTile?.querySelector<HTMLElement>('.tile')?.requestFullscreen().catch(() => {});
  }

  function menu(t: Tile, node: HTMLElement, fullscreen: () => void): MenuItem[] {
    const feed = t.feed;
    if (t.screen && feed) {
      const now = qualities[feed.id] ?? 'auto';
      if (!feed.watching) return [{ label: m.call.watchStream, onselect: () => feed.watch(true) }];
      return [
        ...(feed.local ? [] : [streamVolumeItem(voice, t.user), 'separator' as const]),
        ...(feed.local ? [] : QUALITIES.map((q): MenuItem => ({
          kind: 'check', label: m.call.qualityItem(m.call.qualities[q]), checked: now === q,
          onselect: () => { qualities = { ...qualities, [feed.id]: q }; feed.setQuality(q); },
        }))),
        { kind: 'check', label: m.call.statsOverlay, checked: overlay, onselect: () => saveVoiceSettings({ statsOverlay: !overlay }) },
        'separator',
        { label: m.call.fullscreen, onselect: fullscreen },
        ...(feed.local ? [] : ['separator' as const, { label: m.call.stopWatching, onselect: () => feed.watch(false) }]),
      ];
    }
    return [
      ...participantMenu(session, voice, t.user, { profile: () => popout.open(t.user, server, node), server }),
      'separator',
      { label: m.call.fullscreen, onselect: fullscreen },
    ];
  }
</script>

{#snippet chevron(kind: DeviceMenuKind | 'share', label: string)}
  <button class="chevron" aria-label={label} aria-haspopup="menu" aria-expanded={!!quick && quick.anchor.dataset.kind === kind} data-kind={kind}
    onclick={(e) => void openQuick(kind, e.currentTarget)}><ChevronDown size={14} aria-hidden="true" /></button>
{/snippet}

{#snippet tile(t: Tile, small = false)}
  {@const talking = here && voice.speaking.has(t.user)}
  {@const muted = !t.screen && isMuted(t.user)}
  {@const vol = t.user === store.selfId ? 100 : Math.round(voice.volumeOf(t.screen ? streamVolumeKey(t.user) : t.user) * 100)}
  <CallTile
    name={store.displayName(t.user, server)} avatar={avatar(t.user)} feed={t.feed} screen={t.screen} talking={!t.screen && talking} {muted}
    focused={focusedId === t.id} {small} appear={appears(t.id)}
    volume={vol}
    states={[t.user === store.selfId ? m.call.you : '', talking && !t.screen ? m.voiceState.speaking : '', muted ? m.voiceState.muted : '', vol !== 100 ? m.call.volumeMark(vol) : '', focusedId === t.id ? m.call.focused : ''].filter(Boolean)}
    ontoggle={() => (focusedId = focusedId === t.id ? null : t.id)}
    menu={(node, fullscreen) => menu(t, node, fullscreen)}
  >
    {#if t.screen && t.feed?.watching && overlay}<StatsOverlay feed={t.feed} />{/if}
  </CallTile>
{/snippet}

<section class="call" class:compact aria-label={info ? m.call.view(channelName(store, info)) : undefined}>
  {#if !compact}
    <!-- The stage's own header row: how many are in the channel (motion spec 4.9). -->
    <div class="stage-head">
      {#if stream && focused}
        <span class="streamer"><Avatar src={avatar(focused.user)} size={24} /><span>{m.call.screenOf(store.displayName(focused.user, server))}</span></span>
        {#if streamStats}<span class="quality">{m.call.streamQuality(m.call.size(streamStats.width, streamStats.height), m.call.fpsValue(streamStats.fps))}</span>{/if}
        <span class="live">{m.call.live}</span>
      {/if}
      <span class="count" aria-label={m.call.count(participants.length)} use:tooltip={{ text: m.call.count(participants.length), placement: 'bottom' }}><Users size={18} aria-hidden="true" />{participants.length}</span>
    </div>
  {/if}
  {#if here}
    {#if focused}
      <div class="stage">
        <div class="main-tile" bind:this={mainTile}>{@render tile(focused)}</div>
        {#if rest.length}
          {@const label = stageView.membersHidden ? m.call.showMembers : m.call.hideMembers}
          <!-- On the strip's top edge: folds it away so the focused tile takes its height, for the session. -->
          <div class="strip-edge">
            <button class="fold" aria-label={label} aria-expanded={!stageView.membersHidden} use:tooltip={{ text: label, placement: 'top' }}
              onclick={() => (stageView.membersHidden = !stageView.membersHidden)}>
              {#if stageView.membersHidden}<ChevronUp size={16} aria-hidden="true" />{:else}<ChevronDown size={16} aria-hidden="true" />{/if}<Users size={16} aria-hidden="true" />
            </button>
          </div>
          {#if !stageView.membersHidden}<div class="strip">{#each rest as t (t.id)}<div class="small">{@render tile(t, true)}</div>{/each}</div>{/if}
        {/if}
      </div>
    {:else}
      <div class="grid">
        {#each tiles as t (t.id)}{@render tile(t)}{/each}
      </div>
    {/if}
    {#if !voice.rights.listen && !voice.serverDeafened}<p class="notice" role="status">{m.voice.cantHear}</p>{/if}
    <div class="bar" role="toolbar" aria-label={m.call.controls}>
      <span></span>
      <div class="controls">
      <span class="pair">
      <button class="control" class:off={voice.muted || !!voice.micLock} class:locked={!!voice.micLock} aria-label={muteLabel} aria-disabled={!!voice.micLock} use:tooltip={muteLabel} onclick={() => voice.toggleMute()}>
        {#if voice.muted || voice.micLock}<MicOff />{:else}<Mic />{/if}
      </button>
      {@render chevron('input', m.voice.inputOptions)}
      </span>
      <span class="pair">
      <!-- Locked rather than disabled, so the tooltip still says why. -->
      <button class="control" class:on={voice.camera} class:dim={!!voice.videoLock} aria-label={cameraLabel} use:tooltip={cameraLabel} aria-disabled={!!voice.videoLock}
        disabled={voice.status !== 'connected'} onclick={() => { if (!voice.videoLock) voice.toggleCamera(); }}>
        {#if voice.camera}<Video />{:else}<VideoOff />{/if}
      </button>
      {@render chevron('camera', m.call.cameraOptions)}
      </span>
      <span class="pair">
      <button class="control" class:on={voice.sharing} class:dim={!!voice.videoLock} aria-label={shareLabel} use:tooltip={shareLabel} aria-disabled={!!voice.videoLock}
        disabled={voice.status !== 'connected'} onclick={() => { if (!voice.videoLock) { if (voice.sharing) voice.stopShare(); else shareDialog.open = true; } }}><ScreenShare /></button>
      {@render chevron('share', m.call.shareOptions)}
      </span>
      <button class="control leave" aria-label={m.voice.disconnect} use:tooltip={m.voice.disconnect} onclick={() => voice.leave()}><PhoneOff /></button>
      </div>
      <div class="end">
        {#if focused}<button class="control" aria-label={m.call.fullscreen} use:tooltip={m.call.fullscreen} onclick={fullscreenFocused}><Maximize /></button>{/if}
      </div>
    </div>
    <Menu open={!!quick} onclose={() => (quick = null)} items={quick?.items ?? []} anchor={quick?.anchor ?? null} label={m.voice.voiceSettings} />
  {:else}
    <div class="lobby">
      {#if participants.length}
        <ul class="people">
          {#each participants as v (v.user)}
            <li><Avatar src={avatar(v.user)} size={80} /><span>{store.displayName(v.user, server)}</span></li>
          {/each}
        </ul>
        <p>{compact ? m.call.presentCall(participants.length) : m.call.present(participants.length)}</p>
      {:else if compact}
        <p>{m.call.empty}</p>
      {:else}
        <!-- The empty stage: the channel's icon, a bar, its name, and who's there, which is no one (motion spec 4.9). -->
        <div class="empty-title">
          {#if info?.kind === 'text' && info.icon}<img use:fadeIn class="channel-icon" src={fileUrl(info.icon, { maxSide: 64 })} alt="" width="32" height="32" />{:else}<Volume2 size={28} aria-hidden="true" />{/if}
          <span class="bar-mark" aria-hidden="true"></span>
          <h2>{info ? channelName(store, info) : ''}</h2>
        </div>
        <p>{m.call.empty}</p>
      {/if}
      {#if rights.connect}
        <Button onclick={() => voice.join(channel)}>{m.call.join}</Button>
      {:else}
        <p class="cant" role="status"><strong>{m.voice.cantJoin}</strong> {m.voice.cantJoinHelp}</p>
      {/if}
    </div>
  {/if}
</section>

<style>
  /* The stage (motion spec 4.9): rounded inside the black, dark at the top and light at the bottom, with a glow at
     its foot, all mixed from the accent so it stays Concord's. */
  .call {
    position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; margin: 0 var(--space-3) var(--space-3);
    border-radius: var(--radius-md); overflow: hidden;
    background:
      radial-gradient(45% 30% at 50% 100%, color-mix(in srgb, var(--accent) 45%, transparent), transparent),
      linear-gradient(180deg, color-mix(in srgb, var(--accent) 5%, var(--surface-0)) 0%, color-mix(in srgb, var(--accent) 12%, var(--surface-0)) 30%,
        color-mix(in srgb, var(--accent) 24%, var(--surface-0)) 60%, color-mix(in srgb, var(--accent) 38%, var(--surface-0)) 85%, color-mix(in srgb, var(--accent) 42%, var(--surface-0)) 100%);
  }
  .compact { flex: none; height: min(26rem, 45%); margin: 0; border-radius: 0; border-bottom: 1px solid var(--border-subtle); background: var(--surface-0); }
  .stage-head { display: flex; align-items: center; justify-content: flex-end; gap: var(--space-3); padding: var(--space-4) var(--space-5) 0; color: var(--text-strong); font: 600 var(--text-sm) var(--font-sans); }
  .streamer { display: inline-flex; align-items: center; gap: var(--space-3); min-width: 0; margin-right: auto; }
  .streamer span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .quality { color: var(--text-secondary); font-variant-numeric: tabular-nums; }
  .live { padding: 0 var(--space-2); border-radius: var(--radius-xs); background: var(--danger-fill); color: var(--on-danger); font: 700 var(--text-xs) var(--font-sans); letter-spacing: 0.02em; }
  .count { display: inline-flex; align-items: center; gap: var(--space-2); color: var(--text-strong); font: 600 var(--text-sm) var(--font-sans); font-variant-numeric: tabular-nums; }
  .empty-title { display: flex; align-items: center; gap: var(--space-4); color: var(--text-strong); }
  .empty-title h2 { margin: 0; font: 700 var(--text-xl) var(--font-sans); }
  .channel-icon { width: 2rem; height: 2rem; border-radius: var(--radius-md); }
  .bar-mark { width: 1px; height: 1.5rem; background: var(--border-control); }
  .compact .lobby { gap: var(--space-4); padding: var(--space-5); }
  .grid {
    flex: 1; min-height: 0; overflow-y: auto; display: grid; align-content: center; gap: var(--space-3); padding: var(--space-5);
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
  }
  .stage { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-5); }
  .main-tile { flex: 1; min-height: 0; display: grid; place-items: center; }
  .main-tile :global(.tile) { max-width: 100%; max-height: 100%; width: auto; height: 100%; }
  .strip-edge { flex: none; display: flex; justify-content: center; margin-bottom: calc(-1 * var(--space-2)); }
  .fold {
    display: inline-flex; align-items: center; gap: var(--space-1); padding: var(--space-1) var(--space-3); border: 0; border-radius: var(--radius-full);
    background: var(--scrim); color: var(--text-strong); cursor: pointer;
  }
  @media (hover: hover) { .fold:hover { background: var(--surface-5); } }
  .fold:focus-visible, .chevron:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .strip { flex: none; display: flex; gap: var(--space-3); overflow-x: auto; justify-content: center; }
  .small { flex: none; width: 10rem; }
  /* The controls in the middle, full screen at the right. */
  .bar { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: var(--space-4); padding: var(--space-3) var(--space-5) var(--space-5); }
  .controls { display: flex; align-items: center; gap: var(--space-4); }
  .end { display: flex; justify-content: flex-end; }
  .pair { display: flex; align-items: center; }
  .chevron {
    display: grid; place-items: center; width: 1.25rem; height: 2rem; margin-left: calc(-1 * var(--space-1)); padding: 0; border: 0;
    border-radius: var(--radius-xs); background: none; color: var(--text-secondary); cursor: pointer;
  }
  @media (hover: hover) { .chevron:hover { background: var(--hover-overlay); color: var(--text-strong); } }
  .control {
    display: grid; place-items: center; width: 3rem; height: 3rem; padding: 0; border: 0; border-radius: var(--radius-full);
    background: var(--surface-4); color: var(--text-strong); cursor: pointer;
    transition: scale var(--dur-press) var(--ease-out);
  }
  .control:active:not(:disabled) { scale: calc(1 - 0.02 * var(--motion)); }
  @media (hover: hover) { .control:hover:not(:disabled) { background: var(--surface-6); } }
  .control:disabled { opacity: 0.4; cursor: not-allowed; }
  .control:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .control :global(svg) { width: var(--icon-lg); height: var(--icon-lg); }
  .control.off { color: var(--danger); }
  .control.locked, .control.dim { cursor: not-allowed; }
  .control.dim { opacity: 0.4; }
  .notice { margin: 0; padding: 0 var(--space-5); text-align: center; color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  .cant strong { display: block; color: var(--text-strong); font-weight: 600; }
  .control.on { background: var(--text-strong); color: var(--surface-0); }
  @media (hover: hover) { .control.on:hover:not(:disabled) { background: var(--text-normal); } }
  .control.leave { background: var(--danger-fill); color: var(--on-danger); }
  @media (hover: hover) { .control.leave:hover { background: var(--danger); } }
  .lobby {
    flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--space-5); padding: var(--space-8);
    color: var(--text-secondary); font: var(--text-md) var(--font-sans); text-align: center;
  }
  .lobby p { margin: 0; }
  .people { display: flex; flex-wrap: wrap; justify-content: center; gap: var(--space-6); margin: 0; padding: 0; list-style: none; }
  .people li { display: grid; justify-items: center; gap: var(--space-3); color: var(--text-strong); font: 500 var(--text-sm) var(--font-sans); }
</style>
