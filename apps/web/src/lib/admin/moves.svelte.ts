/**
 * Moves a moderator has started and that haven't finished (m4.7-plan.md task 3). Stoat changes someone's channel only
 * when their client connects to the new one, and answers 500 to a second move before then (m4.7-results.md), so a move
 * stays pending until the person shows up in the new channel, leaves, or 12 s pass (a token's life, plus a margin). A
 * client that can't follow, such as Stoat's own, never finishes one.
 */
import type { Id, Session } from '@concord/domain';
import { SvelteMap } from 'svelte/reactivity';
import { m } from '$lib/i18n/index.ts';
import { voiceModeration } from './voice.ts';
import { toasts } from '$lib/view/toast.svelte.ts';

export const MOVE_WAIT_MS = 12_000;

class Moves {
  /** Who is being moved, and to which channel. */
  readonly pending = new SvelteMap<Id, Id>();

  isPending(user: Id): boolean {
    return this.pending.has(user);
  }

  /** The person being dragged and the channels they may be dropped on, while a drag is under way. */
  dragging = $state<{ user: Id; to: ReadonlySet<Id> } | null>(null);
  /** The allowed channel the drag is over. */
  hover = $state<Id | null>(null);

  /** Whether a row can be dragged: this account may move them somewhere, and they aren't being moved already. */
  canDrag(session: Session, user: Id): boolean {
    return !this.pending.has(user) && !!voiceModeration(session, user)?.destinations.length;
  }

  startDrag(session: Session, user: Id, e: DragEvent): void {
    const mod = voiceModeration(session, user);
    if (!mod?.destinations.length) return e.preventDefault();
    // Firefox starts no drag without data.
    e.dataTransfer?.setData('text/plain', user);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    this.dragging = { user, to: new Set(mod.destinations) };
  }

  endDrag(): void {
    this.dragging = null;
    this.hover = null;
  }

  /** Over a channel (or its list of people): accept the drop only where the drag may go. */
  over(e: DragEvent, channel: Id): void {
    if (!this.dragging?.to.has(channel)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    this.hover = channel;
  }

  leave(channel: Id): void {
    if (this.hover === channel) this.hover = null;
  }

  drop(e: DragEvent, session: Session, channel: Id): void {
    const d = this.dragging;
    if (!d?.to.has(channel)) return;
    e.preventDefault();
    this.endDrag();
    void this.move(session, d.user, channel);
  }

  /** Move someone to a server voice channel. Does nothing while they already have a move pending. */
  async move(session: Session, user: Id, to: Id): Promise<void> {
    const store = session.store;
    const dest = store.channels.get(to);
    if (this.pending.has(user) || !dest || dest.kind !== 'text') return;
    const from = store.voiceChannelOf(user);
    const name = store.displayName(user, dest.server);
    this.pending.set(user, to);
    try {
      await session.admin.editMember(dest.server, user, { voiceChannel: to });
    } catch {
      this.pending.delete(user);
      toasts.show(m.voiceMod.moveFailed(name));
      return;
    }
    const deadline = Date.now() + MOVE_WAIT_MS;
    const timer = setInterval(() => {
      const now = store.voiceChannelOf(user);
      const arrived = now === to;
      // Gone from the old channel to somewhere else or nowhere also ends it, but only an arrival is good news.
      if (!arrived && now === from && Date.now() < deadline) return;
      clearInterval(timer);
      this.pending.delete(user);
      if (arrived) toasts.show(m.voiceMod.moved(name, dest.name), 'info');
      else if (now === from) toasts.show(m.voiceMod.moveIncomplete(name));
    }, 250);
  }
}

export const moves = new Moves();
