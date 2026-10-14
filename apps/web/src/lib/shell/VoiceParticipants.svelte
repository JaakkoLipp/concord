<script lang="ts">
  /**
   * The people in a voice channel, listed under its sidebar row (client.md section 10.3), in the order they
   * joined. The speaking ring comes from LiveKit, so only the user's own call fills `speaking`.
   */
  import { Avatar } from '@concord/ui';
  import { memberKey, type Id, type Store } from '@concord/domain';
  import HeadphoneOff from '@lucide/svelte/icons/headphone-off';
  import MicOff from '@lucide/svelte/icons/mic-off';
  import Video from '@lucide/svelte/icons/video';
  import { m } from '$lib/i18n/index.ts';
  import { avatarUrl } from '$lib/view/users.ts';
  import { popout } from '$lib/view/popout.svelte.ts';
  import { menuOn } from '$lib/view/contextmenu.svelte.ts';
  import { app } from '$lib/session/app.svelte.ts';
  import { personMenu } from '$lib/people/actions.ts';
  import { voiceMarks } from './voice.ts';

  interface Props { store: Store; channel: Id; name: string; server?: Id | undefined; speaking?: ReadonlySet<Id> }
  let { store, channel, name, server, speaking = new Set() }: Props = $props();
  const participants = $derived(store.voiceParticipants(channel));
</script>

<ul class="participants" aria-label={m.voiceState.participants(name)}>
  {#each participants as v (v.user)}
    {@const marks = voiceMarks(store, v, server)}
    {@const display = store.displayName(v.user, server)}
    {@const talking = speaking.has(v.user)}
    {@const member = server ? store.members.get(memberKey(server, v.user)) : undefined}
    <li>
      <button
        class="participant" class:talking
        aria-label={m.voiceState.participant(display, [
          talking ? m.voiceState.speaking : '', marks.serverMuted ? m.voiceState.serverMuted : '', marks.muted ? m.voiceState.muted : '',
          marks.serverDeafened ? m.voiceState.serverDeafened : '', marks.camera ? m.voiceState.camera : '', marks.live ? m.voiceState.sharing : '',
        ].filter(Boolean))}
        onclick={(e) => popout.open(v.user, server, e.currentTarget)}
        use:menuOn={(node) => (app.session ? personMenu(app.session, v.user, { profile: () => popout.open(v.user, server, node), server }) : [])}
      >
        <span class="avatar"><Avatar src={avatarUrl(store.users.get(v.user) ?? { id: v.user }, member?.avatar)} size={24} /></span>
        <span class="name">{display}</span>
        <span class="marks" aria-hidden="true">
          {#if marks.live}<span class="live">{m.voiceState.live}</span>{/if}
          {#if marks.camera}<Video size={16} />{/if}
          {#if marks.serverMuted}<span class="server"><MicOff size={16} /></span>{:else if marks.muted}<MicOff size={16} />{/if}
          {#if marks.serverDeafened}<span class="server"><HeadphoneOff size={16} /></span>{/if}
        </span>
      </button>
    </li>
  {/each}
</ul>

<style>
  /* Avatars line up with the channel name above: its icon and gap, as both rows share the same padding. */
  .participants { list-style: none; margin: 0; padding: 0 0 var(--space-2) calc(var(--icon-md) + var(--space-3)); }
  .participant {
    display: flex; align-items: center; gap: var(--space-3); width: 100%; min-height: var(--row-channel); margin-top: 2px; padding: 0 var(--space-3);
    border: 0; border-radius: var(--radius-md); background: none; color: var(--text-secondary); text-align: left;
    font: 500 var(--text-sm) var(--font-sans); cursor: pointer;
  }
  .participant:hover { background: var(--hover-overlay); color: var(--text-normal); }
  .participant:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .avatar { display: grid; flex: none; border-radius: var(--radius-full); transition: box-shadow var(--dur-hover) var(--ease-out); }
  .talking .avatar { box-shadow: 0 0 0 2px var(--status-online); }
  .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .marks { display: flex; align-items: center; gap: var(--space-2); flex: none; color: var(--text-secondary); }
  .server { display: grid; color: var(--danger); }
  .live {
    padding: 0 var(--space-2); border-radius: var(--radius-xs); background: var(--danger-fill); color: var(--on-danger);
    font: 700 var(--text-xs) var(--font-sans); text-transform: uppercase;
  }
</style>
