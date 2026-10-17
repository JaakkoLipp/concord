/**
 * Desktop notifications while the client is open (m2c-plan.md task 8). Only the tab holding the
 * `concord:notify` Web Lock notifies, so one per browser. Each tab shares the channel it shows while its
 * window has focus, refreshed every 30 s and ignored after 60 s, so the notifying tab, even in the
 * background, stays quiet about a channel being read in another.
 */
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { memberKey, mentionsYou, shouldNotify, type Message, type Session } from '@concord/domain';
import { avatarUrl } from '$lib/view/users.ts';
import { notificationBody, notificationTitle } from './text.ts';
import { SOUND_PREFS_KEY, notifyPrefs, soundPrefs } from './prefs.svelte.ts';
import { playMessageSound } from '$lib/voice/sounds.ts';

const LOCK = 'concord:notify';
const FOCUS_KEY = 'concord:focus';
const SHARE_EVERY_MS = 30_000;
const FOCUS_FRESH_MS = 60_000;
/** A burst of messages makes one sound. */
const SOUND_GAP_MS = 1_000;

/** The channel this tab shows, from its address. */
function shownChannel(): string | null {
  const parts = location.pathname.split('/');
  // /app/channels/<server or @me>/<channel>[/<message>]
  return parts[2] === 'channels' && parts[4] ? parts[4] : null;
}

/** This tab holds the lock, so it is the one in this browser that notifies. DM calls ask too. */
let leader = false;
export const leadsNotifications = () => leader;

export function watchNotifications(session: Session): () => void {
  const tab = Math.random().toString(36).slice(2);
  leader = !navigator.locks;
  let release: (() => void) | null = null;
  let stopped = false;

  const focusedHere = () => document.visibilityState === 'visible' && document.hasFocus();
  const share = () => {
    try {
      const channel = focusedHere() ? shownChannel() : null;
      const before = JSON.parse(localStorage.getItem(FOCUS_KEY) ?? 'null') as { tab: string } | null;
      if (channel) localStorage.setItem(FOCUS_KEY, JSON.stringify({ tab, channel, at: Date.now() }));
      else if (before?.tab === tab) localStorage.removeItem(FOCUS_KEY);
    } catch {
      // Storage blocked: this tab still knows its own focus.
    }
  };
  /** The channel a focused window of this browser shows, if any. */
  const focusedChannel = (): string | null => {
    if (focusedHere()) return shownChannel();
    try {
      const f = JSON.parse(localStorage.getItem(FOCUS_KEY) ?? 'null') as { channel: string; at: number } | null;
      return f && Date.now() - f.at < FOCUS_FRESH_MS ? f.channel : null;
    } catch {
      return null;
    }
  };

  let lastSound = 0;
  const show = (message: Message) => {
    const store = session.store;
    const self = store.self;
    // The leader tab alone, for sounds as for notifications, so one browser makes one sound.
    if (!leader || !self || (!notifyPrefs.active && !soundPrefs.on)) return;
    const c = store.channels.get(message.channel);
    if (!c || c.kind === 'saved') return;
    const server = c.kind === 'text' ? c.server : undefined;
    const roles = server ? store.members.get(memberKey(server, self.id))?.roles ?? [] : [];
    const ok = shouldNotify(message, {
      self: self.id,
      roles,
      presence: self.presence ?? (self.online ? 'Online' : 'Invisible'),
      level: store.channelLevel(message.channel),
      muted: store.notificationsMuted(message.channel),
      blocked: store.users.get(message.author)?.relationship === 'Blocked',
      focusedChannel: focusedChannel(),
      ignoreBroad: !!server && !!store.ignoredMentions[server],
    });
    if (!ok) return;
    const mention = mentionsYou(message, self.id, roles, !!server && !!store.ignoredMentions[server]);
    if (soundPrefs.on && Date.now() - lastSound > SOUND_GAP_MS) {
      lastSound = Date.now();
      playMessageSound(mention ? 'mention' : 'message', soundPrefs.volume);
    }
    if (!notifyPrefs.active) return;
    const author = store.users.get(message.author);
    let n: Notification;
    try {
      n = new Notification(notificationTitle(store, message), {
        body: notificationBody(store, message),
        icon: new URL(avatarUrl(author ?? { id: message.author }), location.origin).href,
        // One per channel, so a burst shows as one; a mention still alerts when it replaces another.
        tag: message.channel,
        renotify: mention,
        data: { channel: message.channel, message: message.id },
      } as NotificationOptions);
    } catch {
      // Some browsers, such as Chrome on Android, only show notifications from a service worker (M7).
      return;
    }
    n.onclick = () => {
      window.focus();
      n.close();
      void goto(server
        ? resolve('/(app)/app/channels/[server]/[channel]/[[message]]', { server, channel: message.channel, message: message.id })
        : resolve('/(app)/app/channels/@me/[channel]/[[message]]', { channel: message.channel, message: message.id }));
    };
  };

  const onStorage = (e: StorageEvent) => {
    if (e.key === 'concord:notifications') notifyPrefs.refresh();
    if (e.key === SOUND_PREFS_KEY) soundPrefs.refresh();
  };
  const timer = setInterval(share, SHARE_EVERY_MS);
  const events = ['focus', 'blur', 'popstate'] as const;
  for (const e of events) window.addEventListener(e, share);
  document.addEventListener('visibilitychange', share);
  window.addEventListener('storage', onStorage);
  const stopListening = session.onMessage(show);
  // Route changes inside the app: share the new channel while focused.
  let lastPath = location.pathname;
  const route = setInterval(() => { if (location.pathname !== lastPath) { lastPath = location.pathname; share(); } }, 1_000);
  share();

  if (navigator.locks) {
    void navigator.locks.request(LOCK, () => new Promise<void>((done) => {
      if (stopped) return done();
      release = done;
      leader = true;
    }));
  }

  return () => {
    stopped = true;
    leader = false;
    clearInterval(timer);
    clearInterval(route);
    for (const e of events) window.removeEventListener(e, share);
    document.removeEventListener('visibilitychange', share);
    window.removeEventListener('storage', onStorage);
    stopListening();
    try {
      const before = JSON.parse(localStorage.getItem(FOCUS_KEY) ?? 'null') as { tab: string } | null;
      if (before?.tab === tab) localStorage.removeItem(FOCUS_KEY);
    } catch {
      // Storage blocked.
    }
    release?.();
  };
}
