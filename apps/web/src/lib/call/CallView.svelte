<script lang="ts">
  /**
   * The call view (client.md section 10.3), in the conversation column of a voice channel: a grid with a tile for
   * each person and each screen share, a focused tile with the rest in a strip under it, and the call's controls.
   * Before joining, it shows who is in the channel and a Join button. Video comes from LiveKit through the voice
   * controller's feeds; who is in the channel comes from Stoat, as in the sidebar.
   */
  import { Avatar, Button, tooltip, type MenuItem } from '@concord/ui';
  import { memberKey, type Id, type Session } from '@concord/domain';
  import Mic from '@lucide/svelte/icons/mic';
  import MicOff from '@lucide/svelte/icons/mic-off';
  import PhoneOff from '@lucide/svelte/icons/phone-off';
  import ScreenShare from '@lucide/svelte/icons/screen-share';
  import Video from '@lucide/svelte/icons/video';
  import VideoOff from '@lucide/svelte/icons/video-off';
  import { m } from '$lib/i18n/index.ts';
  import { channelName } from '$lib/view/channels.ts';
  import { avatarUrl } from '$lib/view/users.ts';
  import { popout } from '$lib/view/popout.svelte.ts';
  import { voiceMarks } from '$lib/shell/voice.ts';
  import type { Feed, FeedQuality } from '$lib/voice/call.ts';
  import { loadVoiceSettings, onVoiceSettings, saveVoiceSettings } from '$lib/voice/settings.ts';
  import StatsOverlay from './StatsOverlay.svelte';
  import type { VoiceController } from '$lib/voice/controller.svelte.ts';
  import CallTile from './CallTile.svelte';
  import { participantMenu } from './menu.ts';
  import { shareDialog } from './share.svelte.ts';

  /** `compact`: at the top of a DM or group, above its messages, rather than filling the column. */
  let { session, voice, channel, compact = false }: { session: Session; voice: VoiceController; channel: Id; compact?: boolean } = $props();
  const store = $derived(session.store);
  const info = $derived(store.channels.get(channel));
  const server = $derived(info?.kind === 'text' ? info.server : undefined);
  const participants = $derived(store.voiceParticipants(channel));
  const here = $derived(voice.channel === channel && voice.status !== 'none' && voice.status !== 'disconnected');

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

  function menu(t: Tile, node: HTMLElement, fullscreen: () => void): MenuItem[] {
    const feed = t.feed;
    if (t.screen && feed) {
      const now = qualities[feed.id] ?? 'auto';
      return [
        ...(feed.local ? [] : QUALITIES.map((q): MenuItem => ({
          kind: 'check', label: m.call.qualityItem(m.call.qualities[q]), checked: now === q,
          onselect: () => { qualities = { ...qualities, [feed.id]: q }; feed.setQuality(q); },
        }))),
        { kind: 'check', label: m.call.statsOverlay, checked: overlay, onselect: () => saveVoiceSettings({ statsOverlay: !overlay }) },
        'separator',
        { label: m.call.fullscreen, onselect: fullscreen },
      ];
    }
    return [
      ...participantMenu(session, voice, t.user, { profile: () => popout.open(t.user, server, node), server }),
      'separator',
      { label: m.call.fullscreen, onselect: fullscreen },
    ];
  }
</script>

{#snippet tile(t: Tile, small = false)}
  {@const talking = here && voice.speaking.has(t.user)}
  {@const muted = !t.screen && isMuted(t.user)}
  <CallTile
    name={store.displayName(t.user, server)} avatar={avatar(t.user)} feed={t.feed} screen={t.screen} talking={!t.screen && talking} {muted}
    focused={focusedId === t.id} {small}
    states={[t.user === store.selfId ? m.call.you : '', talking && !t.screen ? m.voiceState.speaking : '', muted ? m.voiceState.muted : '', focusedId === t.id ? m.call.focused : ''].filter(Boolean)}
    ontoggle={() => (focusedId = focusedId === t.id ? null : t.id)}
    menu={(node, fullscreen) => menu(t, node, fullscreen)}
  >
    {#if t.screen && t.feed && overlay}<StatsOverlay feed={t.feed} />{/if}
  </CallTile>
{/snippet}

<section class="call" class:compact aria-label={info ? m.call.view(channelName(store, info)) : undefined}>
  {#if here}
    {#if focused}
      <div class="stage">
        <div class="main-tile">{@render tile(focused)}</div>
        {#if rest.length}<div class="strip">{#each rest as t (t.id)}<div class="small">{@render tile(t, true)}</div>{/each}</div>{/if}
      </div>
    {:else}
      <div class="grid">
        {#each tiles as t (t.id)}{@render tile(t)}{/each}
      </div>
    {/if}
    <div class="bar" role="toolbar" aria-label={m.call.controls}>
      <button class="control" class:off={voice.muted} aria-label={voice.muted ? m.voice.unmute : m.voice.mute} use:tooltip={voice.muted ? m.voice.unmute : m.voice.mute} onclick={() => voice.toggleMute()}>
        {#if voice.muted}<MicOff />{:else}<Mic />{/if}
      </button>
      <button class="control" class:on={voice.camera} aria-label={voice.camera ? m.voice.cameraOff : m.voice.cameraOn} use:tooltip={voice.camera ? m.voice.cameraOff : m.voice.cameraOn} disabled={voice.status !== 'connected'} onclick={() => voice.toggleCamera()}>
        {#if voice.camera}<Video />{:else}<VideoOff />{/if}
      </button>
      <button class="control" class:on={voice.sharing} aria-label={voice.sharing ? m.voice.stopShare : m.voice.share} use:tooltip={voice.sharing ? m.voice.stopShare : m.voice.share}
        disabled={voice.status !== 'connected'} onclick={() => (voice.sharing ? voice.stopShare() : (shareDialog.open = true))}><ScreenShare /></button>
      <button class="control leave" aria-label={m.voice.disconnect} use:tooltip={m.voice.disconnect} onclick={() => voice.leave()}><PhoneOff /></button>
    </div>
  {:else}
    <div class="lobby">
      {#if participants.length}
        <ul class="people">
          {#each participants as v (v.user)}
            <li><Avatar src={avatar(v.user)} size={80} /><span>{store.displayName(v.user, server)}</span></li>
          {/each}
        </ul>
        <p>{compact ? m.call.presentCall(participants.length) : m.call.present(participants.length)}</p>
      {:else}
        <p>{m.call.empty}</p>
      {/if}
      <Button onclick={() => voice.join(channel)}>{m.call.join}</Button>
    </div>
  {/if}
</section>

<style>
  .call { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; background: var(--surface-0); }
  .compact { flex: none; height: min(26rem, 45%); border-bottom: 1px solid var(--border-subtle); }
  .compact .lobby { gap: var(--space-4); padding: var(--space-5); }
  .grid {
    flex: 1; min-height: 0; overflow-y: auto; display: grid; align-content: center; gap: var(--space-3); padding: var(--space-5);
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
  }
  .stage { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-5); }
  .main-tile { flex: 1; min-height: 0; display: grid; place-items: center; }
  .main-tile :global(.tile) { max-width: 100%; max-height: 100%; width: auto; height: 100%; }
  .strip { flex: none; display: flex; gap: var(--space-3); overflow-x: auto; justify-content: center; }
  .small { flex: none; width: 10rem; }
  .bar { display: flex; justify-content: center; gap: var(--space-4); padding: var(--space-3) var(--space-5) var(--space-5); }
  .control {
    display: grid; place-items: center; width: 3rem; height: 3rem; padding: 0; border: 0; border-radius: var(--radius-full);
    background: var(--surface-4); color: var(--text-strong); cursor: pointer; transition: background var(--dur-hover) var(--ease-out);
  }
  .control:hover:not(:disabled) { background: var(--surface-6); }
  .control:disabled { opacity: 0.4; cursor: not-allowed; }
  .control:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .control :global(svg) { width: var(--icon-lg); height: var(--icon-lg); }
  .control.off { color: var(--danger); }
  .control.on { background: var(--text-strong); color: var(--surface-0); }
  .control.on:hover:not(:disabled) { background: var(--text-normal); }
  .control.leave { background: var(--danger-fill); color: var(--on-danger); }
  .control.leave:hover { background: var(--danger); }
  .lobby {
    flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--space-5); padding: var(--space-8);
    color: var(--text-secondary); font: var(--text-md) var(--font-sans); text-align: center;
  }
  .lobby p { margin: 0; }
  .people { display: flex; flex-wrap: wrap; justify-content: center; gap: var(--space-6); margin: 0; padding: 0; list-style: none; }
  .people li { display: grid; justify-items: center; gap: var(--space-3); color: var(--text-strong); font: 500 var(--text-sm) var(--font-sans); }
</style>
