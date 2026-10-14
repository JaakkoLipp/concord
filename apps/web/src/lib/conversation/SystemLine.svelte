<script lang="ts">
  import type { Message, Store } from '@concord/domain';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Pin from '@lucide/svelte/icons/pin';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Phone from '@lucide/svelte/icons/phone';
  import Info from '@lucide/svelte/icons/info';
  import { m } from '$lib/i18n/index.ts';
  import { timeOfDay, ulidTime } from '$lib/markdown/time.ts';
  import { app } from '$lib/session/app.svelte.ts';

  let { message, store, server, onjump }: { message: Message; store: Store; server: string | undefined; onjump: (id: string) => void } = $props();
  const s = $derived(message.system!);
  const name = (id: string) => store.displayName(id, server) || m.markdown.unknownUser;
  /** A call_started line offers Join while its call runs and this client isn't in it (client.md section 10.3). */
  const joinable = $derived.by(() => {
    if (s.type !== 'call_started' || s.finishedAt || !store.voice.has(message.channel)) return false;
    const v = app.voice;
    return !!v && !(v.channel === message.channel && v.status !== 'none' && v.status !== 'disconnected');
  });
</script>

<div class="system">
  <span class="icon" aria-hidden="true">
    {#if s.type === 'user_joined' || s.type === 'user_added'}<ArrowRight size={16} class="in" />{:else if s.type === 'user_left' || s.type === 'user_remove' || s.type === 'user_kicked' || s.type === 'user_banned'}<ArrowLeft size={16} class="out" />{:else if s.type === 'message_pinned' || s.type === 'message_unpinned'}<Pin size={16} />{:else if s.type === 'call_started'}<Phone size={16} />{:else if s.type.startsWith('channel_')}<Pencil size={16} />{:else}<Info size={16} />{/if}
  </span>
  <span class="text">
    {#if s.type === 'text'}{s.content}
    {:else if s.type === 'user_joined'}{m.system.joined(name(s.id))}
    {:else if s.type === 'user_left'}{store.channels.get(message.channel)?.kind === 'group' ? m.system.leftGroup(name(s.id)) : m.system.left(name(s.id))}
    {:else if s.type === 'user_kicked'}{m.system.kicked(name(s.id))}
    {:else if s.type === 'user_banned'}{m.system.banned(name(s.id))}
    {:else if s.type === 'user_added'}{m.system.added(name(s.by), name(s.id))}
    {:else if s.type === 'user_remove'}{m.system.removed(name(s.by), name(s.id))}
    {:else if s.type === 'channel_renamed'}{m.system.renamed(name(s.by), s.name)}
    {:else if s.type === 'channel_description_changed'}{m.system.description(name(s.by))}
    {:else if s.type === 'channel_icon_changed'}{m.system.icon(name(s.by))}
    {:else if s.type === 'channel_ownership_changed'}{m.system.ownership(name(s.from), name(s.to))}
    {:else if s.type === 'message_pinned' || s.type === 'message_unpinned'}{@const id = s.id}{s.type === 'message_pinned' ? m.system.pinned(name(s.by)) : m.system.unpinned(name(s.by))} <button class="link" onclick={() => onjump(id)}>{m.system.seeMessage}</button>
    {:else if s.type === 'call_started'}{m.system.call(name(s.by))}{#if joinable} <button class="link" onclick={() => app.voice?.join(message.channel)}>{m.system.joinCall}</button>{/if}
    {/if}
  </span>
  <time class="time" datetime={ulidTime(message.id).toISOString()}>{timeOfDay(ulidTime(message.id))}</time>
</div>

<style>
  .system { display: flex; align-items: center; gap: var(--space-4); padding: var(--space-1) 0 var(--space-1) calc(var(--avatar-md) / 2 - 2px); color: var(--text-secondary); font: var(--text-md) var(--font-sans); }
  .icon { display: grid; width: calc(var(--avatar-md) / 2 + var(--space-5)); flex: none; }
  .icon :global(.in) { color: var(--status-online); }
  .icon :global(.out) { color: var(--danger); }
  .text { min-width: 0; }
  .time { color: var(--text-secondary); font: var(--text-xs) var(--font-sans); font-variant-numeric: tabular-nums; }
  .link { padding: 0; background: none; border: 0; color: var(--text-strong); font: 500 var(--text-md) var(--font-sans); }
  .link:hover { text-decoration: underline; }
</style>
