<script lang="ts">
  import type { Message, Store } from '@concord/domain';
  import { Avatar } from '@concord/ui';
  import Markdown from '$lib/markdown/Markdown.svelte';
  import { fullDate, timeOfDay, ulidTime } from '$lib/markdown/time.ts';
  import { m } from '$lib/i18n/index.ts';
  import { avatarUrl } from '$lib/view/users.ts';
  import { proxied } from '$lib/view/media.ts';
  import { popout } from '$lib/view/popout.svelte.ts';
  import Attachment from './Attachment.svelte';
  import Embed from './Embed.svelte';
  import Reactions from './Reactions.svelte';
  import ReplyPreview from './ReplyPreview.svelte';
  import SystemLine from './SystemLine.svelte';

  interface Props { message: Message; store: Store; server: string | undefined; continuation: boolean; highlighted: boolean; onjump: (id: string) => void }
  let { message, store, server, continuation, highlighted, onjump }: Props = $props();

  const user = $derived(store.users.get(message.author));
  const member = $derived(server && store.selfId ? store.members.get(`${server}:${message.author}`) : undefined);
  const name = $derived(message.masquerade?.name ?? message.webhook?.name ?? store.displayName(message.author, server) ?? m.markdown.unknownUser);
  const colour = $derived(message.masquerade?.colour ?? (server ? store.roleColour(message.author, server) : undefined));
  const avatar = $derived(message.masquerade?.avatar ? proxied(message.masquerade.avatar) : avatarUrl(user ?? { id: message.author }, member?.avatar));
  const sent = $derived(ulidTime(message.id));
  const mentioned = $derived(message.author !== store.selfId && store.mentionsSelf(message) && store.channels.get(message.channel)?.kind === 'text');
</script>

{#if message.system}
  <div class="row system" class:highlighted id="message-{message.id}" data-id={message.id}>
    <SystemLine {message} {store} {server} {onjump} />
  </div>
{:else}
  <article class="row message" class:continuation class:mentioned class:highlighted id="message-{message.id}" data-id={message.id} aria-labelledby="author-{message.id}">
    {#each message.replies as reply (reply)}
      <ReplyPreview id={reply} {store} {server} {onjump} />
    {/each}
    <div class="line">
      <div class="gutter">
        {#if continuation}
          <time class="hover-time" datetime={sent.toISOString()} title={fullDate(sent)}>{timeOfDay(sent)}</time>
        {:else}
          <button class="avatar-button" tabindex="-1" aria-hidden="true" onclick={(e) => popout.open(message.author, server, e.currentTarget)}><Avatar src={avatar} size={40} /></button>
        {/if}
      </div>
      <div class="body">
        {#if !continuation}
          <header class="head">
            <button class="name" id="author-{message.id}" style:--role={colour} onclick={(e) => popout.open(message.author, server, e.currentTarget)}>{name}</button>
            {#if user?.bot || message.webhook}<span class="tag">{message.webhook ? m.conversation.webhook : m.conversation.bot}</span>{/if}
            <time class="time" datetime={sent.toISOString()} title={fullDate(sent)}>{timeOfDay(sent)}</time>
          </header>
        {:else}
          <span class="visually-hidden" id="author-{message.id}">{name}</span>
        {/if}
        {#if message.content}
          <div class="content"><Markdown source={message.content} />{#if message.edited}<span class="edited" title={fullDate(new Date(message.edited))}>{m.conversation.edited}</span>{/if}</div>
        {/if}
        {#each message.attachments as file (file.id)}<Attachment {file} />{/each}
        {#each message.embeds as embed, i (i)}<Embed {embed} />{/each}
        {#if Object.keys(message.reactions).length}<Reactions reactions={message.reactions} {store} {server} />{/if}
      </div>
    </div>
  </article>
{/if}

<style>
  .row { position: relative; padding: 0 var(--space-5); content-visibility: auto; contain-intrinsic-size: auto 2.75rem; }
  .message { margin-top: var(--space-5); padding-top: var(--space-1); padding-bottom: var(--space-1); }
  .message.continuation { margin-top: 0; padding-top: 0.125rem; padding-bottom: 0.125rem; }
  .system { margin-top: var(--space-3); }
  .row:hover { background: var(--hover-overlay); }
  .mentioned { background: var(--accent-wash); box-shadow: inset 2px 0 0 var(--accent); }
  .mentioned:hover { background: color-mix(in srgb, var(--accent) 16%, transparent); }
  .highlighted { animation: flash 2s var(--ease-out); }
  @keyframes flash { from { background: var(--accent-subtle); } }
  .line { display: flex; gap: var(--space-5); }
  .gutter { width: var(--avatar-md); flex: none; display: flex; justify-content: center; }
  .hover-time {
    visibility: hidden; color: var(--text-secondary); white-space: nowrap;
    font: 0.625rem/1.375rem var(--font-sans); font-variant-numeric: tabular-nums;
  }
  .row:hover .hover-time { visibility: visible; }
  .body { min-width: 0; flex: 1; }
  .head { display: flex; align-items: baseline; gap: var(--space-3); min-width: 0; }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0; border: 0; background: none; color: var(--text-strong); font: 500 var(--text-md) var(--font-sans); }
  .name:hover { text-decoration: underline; text-decoration-color: var(--text-strong); }
  .avatar-button { padding: 0; border: 0; background: none; border-radius: 50%; height: fit-content; }
  .name[style*='--role'] { background: var(--role); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .tag { padding: 0 var(--space-2); border-radius: var(--radius-xs); background: var(--accent); color: var(--on-accent); font: 700 0.625rem/1rem var(--font-sans); text-transform: uppercase; }
  .time { color: var(--text-secondary); font: var(--text-xs) var(--font-sans); font-variant-numeric: tabular-nums; flex: none; }
  .content { color: var(--text-normal); font: var(--text-md) var(--font-sans); line-height: 1.375rem; overflow-wrap: anywhere; }
  .edited { margin-left: var(--space-2); color: var(--text-secondary); font: var(--text-xs) var(--font-sans); }
</style>
