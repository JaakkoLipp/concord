<script lang="ts">
  import type { Message, PendingMessage, Store } from '@concord/domain';
  import { Avatar } from '@concord/ui';
  import Markdown from '$lib/markdown/Markdown.svelte';
  import { fullDate, timeOfDay, ulidTime } from '$lib/markdown/time.ts';
  import { m } from '$lib/i18n/index.ts';
  import { avatarUrl } from '$lib/view/users.ts';
  import { proxied } from '$lib/view/media.ts';
  import { popout } from '$lib/view/popout.svelte.ts';
  import { menuOn } from '$lib/view/contextmenu.svelte.ts';
  import { app } from '$lib/session/app.svelte.ts';
  import { personMenu } from '$lib/people/actions.ts';
  import Attachment from './Attachment.svelte';
  import Embed from './Embed.svelte';
  import Reactions from './Reactions.svelte';
  import ReplyPreview from './ReplyPreview.svelte';
  import SystemLine from './SystemLine.svelte';
  import ActionBar from './ActionBar.svelte';
  import EditBox from '$lib/composer/EditBox.svelte';

  import type { MessageActions } from './actions.ts';

  interface Props {
    message: Message; store: Store; server: string | undefined; continuation: boolean; highlighted: boolean; onjump: (id: string) => void;
    /** Set while the message is sending or has failed. */
    pending?: PendingMessage | undefined; onretry?: (key: string) => void; ondiscard?: (key: string) => void;
    actions?: MessageActions | undefined; editing?: boolean; selected?: boolean;
  }
  let { message, store, server, continuation, highlighted, onjump, pending, onretry, ondiscard, actions, editing = false, selected = false }: Props = $props();
  const own = $derived(message.author === store.selfId);
  /** The author's context menu. Webhook messages have no user behind them. */
  const authorMenu = (node: HTMLElement) =>
    app.session && !message.webhook ? personMenu(app.session, message.author, { profile: () => popout.open(message.author, server, node), server }) : [];
  let menuOpen = $state(false);
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  /** On touch screens there is no hover: a tap on the message shows its actions. */
  function tap(e: MouseEvent) {
    if (!touch || !actions || (e.target as HTMLElement).closest('a, button, img, video, input, .cm-editor')) return;
    actions.select(selected ? null : message.id);
  }
  const failedReason = (error: string | undefined) => (m.composer.failed as Record<string, string>)[error ?? ''] ?? m.composer.failed.other;

  const user = $derived(store.users.get(message.author));
  const member = $derived(server && store.selfId ? store.members.get(`${server}:${message.author}`) : undefined);
  const name = $derived(message.masquerade?.name ?? message.webhook?.name ?? store.displayName(message.author, server) ?? m.markdown.unknownUser);
  const colour = $derived(message.masquerade?.colour ?? (server ? store.roleColour(message.author, server) : undefined));
  const avatar = $derived(message.masquerade?.avatar ? proxied(message.masquerade.avatar) : avatarUrl(user ?? { id: message.author }, member?.avatar));
  const sent = $derived(ulidTime(message.id));
  // A message that is only a GIF's link shows the GIF alone, as Discord does. Editing still shows the link.
  const gifOnly = $derived(message.embeds.length === 1 && message.embeds[0]!.kind === 'website' && message.embeds[0]!.special?.type === 'other'
    && message.embeds[0]!.special.name === 'GIF' && message.content?.trim() === message.embeds[0]!.url && !message.edited);
  const mentioned = $derived(message.author !== store.selfId && store.mentionsSelf(message) && store.channels.get(message.channel)?.kind === 'text');
</script>

{#if message.system}
  <div class="row system" class:highlighted id="message-{message.id}" data-id={message.id}>
    <SystemLine {message} {store} {server} {onjump} />
  </div>
{:else}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
  <article class="row message" class:continuation class:mentioned class:highlighted class:sending={pending?.state === 'sending'} class:failed={pending?.state === 'failed'} aria-busy={pending?.state === 'sending' || undefined}
    class:selected class:menu-open={menuOpen} class:editing onclick={tap} id="message-{message.id}" data-id={message.id} aria-labelledby="author-{message.id}">
    {#each message.replies as reply (reply)}
      <ReplyPreview id={reply} {store} {server} {onjump} />
    {/each}
    <div class="line">
      <div class="gutter">
        {#if continuation}
          <time class="hover-time" datetime={sent.toISOString()} title={fullDate(sent)}>{timeOfDay(sent)}</time>
        {:else}
          <button class="avatar-button" tabindex="-1" aria-hidden="true" onclick={(e) => popout.open(message.author, server, e.currentTarget)} use:menuOn={authorMenu}><Avatar src={avatar} size={40} /></button>
        {/if}
      </div>
      <div class="body">
        {#if !continuation}
          <header class="head">
            <button class="name" id="author-{message.id}" style:--role={colour} onclick={(e) => popout.open(message.author, server, e.currentTarget)} use:menuOn={authorMenu}>{name}</button>
            {#if user?.bot || message.webhook}<span class="tag">{message.webhook ? m.conversation.webhook : m.conversation.bot}</span>{/if}
            <time class="time" datetime={sent.toISOString()} title={fullDate(sent)}>{timeOfDay(sent)}</time>
          </header>
        {:else}
          <span class="visually-hidden" id="author-{message.id}">{name}</span>
        {/if}
        {#if editing && actions}
          <EditBox text={message.content ?? ''} {store} {server} onsave={(t) => actions.saveEdit(message, t)} oncancel={() => actions.cancelEdit()} />
        {:else if message.content && !gifOnly}
          <div class="content"><Markdown source={message.content} />{#if message.edited}<span class="edited" title={fullDate(new Date(message.edited))}>{m.conversation.edited}</span>{/if}</div>
        {/if}
        {#if pending?.files.length}
          <ul class="uploads">
            {#each pending.files as f, i (i)}
              <li aria-label={m.files.uploading(f.name, Math.round(f.progress * 100))}>
                {#if f.preview}<img src={f.preview} alt="" />{:else}<span class="upload-name">{f.name}</span>{/if}
                {#if !f.id}<progress max="1" value={f.progress}></progress>{/if}
              </li>
            {/each}
          </ul>
        {/if}
        {#if pending?.state === 'failed'}
          <p class="not-sent" role="alert">
            {m.composer.notSent} {failedReason(pending.error)}
            <button onclick={() => onretry?.(pending.key)}>{m.composer.retry}</button>
            <button onclick={() => ondiscard?.(pending.key)}>{m.composer.discard}</button>
          </p>
        {/if}
        {#each message.attachments as file (file.id)}<Attachment {file} />{/each}
        {#each message.embeds as embed, i (i)}<Embed {embed} />{/each}
        {#if Object.keys(message.reactions).length}
          <Reactions reactions={message.reactions} {store} {server} canReact={!!actions?.react}
            ontoggle={actions ? (emoji) => actions.toggleReaction(message, emoji) : undefined}
            onadd={actions ? (anchor) => actions.pickReaction(message, anchor) : undefined} />
        {/if}
      </div>
    </div>
    {#if actions && !pending && !editing}
      <div class="actions">
        <ActionBar canReact={actions.react} onreact={(anchor) => actions.pickReaction(message, anchor)} canReply={actions.send} canEdit={own && !!message.content} canDelete={own || actions.manage} canPin={actions.manage} pinned={message.pinned}
          onreply={() => actions.reply(message)} onedit={() => actions.edit(message)} ondelete={(skip) => actions.delete(message, skip)}
          onpin={() => actions.pin(message)} oncopylink={() => actions.copyLink(message)} oncopyid={() => actions.copyId(message)}
          onmenu={(open) => (menuOpen = open)} />
      </div>
    {/if}
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
  .highlighted { animation: flash var(--dur-flash) var(--ease-out); }
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
  .actions { display: none; position: absolute; top: calc(-1 * var(--space-5)); right: var(--space-5); z-index: 2; }
  .message:hover, .message:focus-within, .message.selected, .message.menu-open { content-visibility: visible; z-index: 1; }
  .message:hover .actions, .message:focus-within .actions, .message.selected .actions, .message.menu-open .actions { display: block; }
  .message.selected, .message.editing { background: var(--hover-overlay); }
  .sending .content { color: var(--text-muted); }
  .uploads { display: flex; flex-wrap: wrap; gap: var(--space-3); margin: var(--space-2) 0 0; padding: 0; list-style: none; }
  .uploads li { display: flex; flex-direction: column; gap: var(--space-1); max-width: 16rem; }
  .uploads img { max-width: 16rem; max-height: 12rem; border-radius: var(--radius-md); opacity: 0.6; }
  .upload-name { padding: var(--space-3) var(--space-4); border-radius: var(--radius-md); background: var(--surface-2); color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  .uploads progress { width: 100%; height: 4px; accent-color: var(--accent); }
  .failed .content { color: var(--danger); }
  .not-sent { margin: var(--space-1) 0 0; color: var(--text-secondary); font: var(--text-xs) var(--font-sans); }
  .not-sent button { margin-left: var(--space-2); padding: 0; border: 0; background: none; color: var(--link); font: inherit; cursor: pointer; }
  .not-sent button:hover { text-decoration: underline; }
  .edited { margin-left: var(--space-2); color: var(--text-secondary); font: var(--text-xs) var(--font-sans); }
</style>
