/**
 * DM and group calls ringing this account (client.md section 10.8, m4-plan.md task 8). The session keeps the
 * rings and stops them on Stoat's end, on our own join from any device and after 30 s. This adds what only the
 * client knows: a call it is rejoining or joining itself never rings. It also plays the ringtone, notifies a
 * hidden tab, and says "Calling…" while this account waits alone in a call it started.
 */
import { untrack } from 'svelte';
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { ringAlerts, type Id, type Ring, type Session } from '@concord/domain';
import { m } from '$lib/i18n/index.ts';
import { leadsNotifications } from '$lib/notify/watch.ts';
import { notifyPrefs } from '$lib/notify/prefs.svelte.ts';
import { channelName } from '$lib/view/channels.ts';
import { avatarUrl } from '$lib/view/users.ts';
import type { VoiceController } from './controller.svelte.ts';
import { ring } from './sounds.ts';

const key = (r: Ring) => `${r.channel}:${r.startedAt}`;

export class Rings {
  private readonly session: Session;
  private readonly voice: VoiceController;
  private readonly stop: () => void;
  private readonly notifications = new Map<string, Notification>();
  /** The DM or group call this client is in, once anyone else has been in it. */
  private answered = $state<Id | null>(null);

  /** Rings to show, oldest first. */
  readonly shown: Ring[] = $derived.by(() => [...this.session.store.rings.values()].filter((r) => !this.suppressed(r)).sort((a, b) => a.startedAt - b.startedAt));
  /** Whether any shown ring may sound, which notification settings and Busy decide. */
  private readonly loud = $derived(this.shown.some((r) => this.alerts(r.channel)));
  /** This client is in a DM or group call it started, and no one else has come. */
  readonly calling: boolean = $derived.by(() => {
    const c = this.voice.channel;
    if (!c || this.voice.status !== 'connected' || this.answered === c) return false;
    const kind = this.session.store.channels.get(c)?.kind;
    return (kind === 'dm' || kind === 'group') && !this.othersIn(c);
  });

  constructor(session: Session, voice: VoiceController) {
    this.session = session;
    this.voice = voice;
    this.stop = $effect.root(() => {
      // A ring for a call this client is rejoining or already joining stops for good, rather than waiting.
      $effect(() => {
        for (const r of this.session.store.rings.values()) if (this.suppressed(r)) this.session.stopRing(r.channel);
      });
      $effect(() => {
        const c = this.voice.channel;
        if (!c || this.voice.status === 'none') this.answered = null;
        else if (this.othersIn(c)) this.answered = c;
      });
      $effect(() => {
        if (this.loud) return ring();
      });
      // Keyed on the shown rings only, so other store changes don't notify again.
      const keys = $derived(this.shown.map(key).join(' '));
      $effect(() => {
        const now = new Set(keys ? keys.split(' ') : []);
        for (const [k, n] of this.notifications) if (!now.has(k)) { n.close(); this.notifications.delete(k); }
        for (const r of untrack(() => this.shown)) if (!this.notifications.has(key(r))) untrack(() => this.notify(r));
      });
    });
  }

  /** Answer: join the call and open its conversation. */
  join(r: Ring): void {
    this.session.stopRing(r.channel);
    this.voice.join(r.channel);
    void goto(resolve('/(app)/app/channels/@me/[channel]/[[message]]', { channel: r.channel }));
  }

  /** Stop ringing here. Stoat has no decline, so the caller isn't told. */
  ignore(r: Ring): void {
    this.session.stopRing(r.channel);
  }

  destroy(): void {
    this.stop();
    for (const n of this.notifications.values()) n.close();
    this.notifications.clear();
  }

  private suppressed(r: Ring): boolean {
    if (r.channel === this.voice.rejoiningChannel) return true;
    return r.channel === this.voice.channel && this.voice.status !== 'none' && this.voice.status !== 'disconnected';
  }

  private othersIn(channel: Id): boolean {
    const self = this.session.store.selfId;
    return Object.keys(this.session.store.voice.get(channel) ?? {}).some((u) => u !== self);
  }

  private alerts(channel: Id): boolean {
    const store = this.session.store;
    const self = store.self;
    return ringAlerts({
      presence: self?.presence ?? (self?.online ? 'Online' : 'Invisible'),
      level: store.channelLevel(channel),
      muted: store.notificationsMuted(channel),
    });
  }

  /** A browser notification, only from a hidden tab and only from the one tab per browser that notifies. */
  private notify(r: Ring): void {
    if (document.visibilityState !== 'hidden' || !leadsNotifications() || !notifyPrefs.active || !this.alerts(r.channel)) return;
    const store = this.session.store;
    const c = store.channels.get(r.channel);
    const caller = store.users.get(r.initiator);
    let n: Notification;
    try {
      n = new Notification(store.displayName(r.initiator) || m.markdown.unknownUser, {
        body: c?.kind === 'group' ? m.voice.ring.callingGroup(channelName(store, c)) : m.voice.ring.callingYou,
        icon: new URL(avatarUrl(caller ?? { id: r.initiator }), location.origin).href,
        tag: `call:${r.channel}`,
      });
    } catch {
      // Some browsers only notify from a service worker (M7).
      return;
    }
    n.onclick = () => {
      window.focus();
      n.close();
      void goto(resolve('/(app)/app/channels/@me/[channel]/[[message]]', { channel: r.channel }));
    };
    this.notifications.set(key(r), n);
  }
}
