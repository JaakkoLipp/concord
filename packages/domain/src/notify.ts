/**
 * Desktop notifications while the client is open (m2c-plan.md, "Notifications"; client.md section 8): the
 * synced `notifications` settings in the shape Stoat's own client writes, and the rule for whether a
 * message notifies. Pure, so it can be tested without a browser.
 */
import type { Id, Message, Presence } from './entities.ts';

export type NotificationLevel = 'all' | 'mention' | 'none';
/** A mute with no end lasts until turned off. `until` is epoch milliseconds. */
export interface Mute { until?: number }

export interface NotificationSettings {
  server: Record<Id, NotificationLevel>;
  channel: Record<Id, NotificationLevel>;
  serverMutes: Record<Id, Mute>;
  channelMutes: Record<Id, Mute>;
}

export const emptyNotifications = (): NotificationSettings => ({ server: {}, channel: {}, serverMutes: {}, channelMutes: {} });
const LEVELS = new Set<string>(['all', 'mention', 'none']);

/**
 * Read the `notifications` key. Stoat's client writes `{server, channel, server_mutes, channel_mutes}`. Its
 * older client wrote a level `muted` instead of a mute: that reads as a mute with no end.
 */
export function parseNotifications(raw: string | undefined): NotificationSettings {
  const out = emptyNotifications();
  let v: Record<string, unknown>;
  try {
    v = JSON.parse(raw ?? '{}') as Record<string, unknown>;
  } catch {
    return out;
  }
  const levels = (src: unknown, into: Record<Id, NotificationLevel>, mutes: Record<Id, Mute>) => {
    for (const [id, level] of Object.entries((src ?? {}) as Record<string, unknown>)) {
      if (level === 'muted') mutes[id] = {};
      else if (typeof level === 'string' && LEVELS.has(level)) into[id] = level as NotificationLevel;
    }
  };
  const mutes = (src: unknown, into: Record<Id, Mute>) => {
    for (const [id, m] of Object.entries((src ?? {}) as Record<string, unknown>)) {
      const until = (m as { until?: unknown } | null)?.until;
      into[id] = typeof until === 'number' ? { until } : {};
    }
  };
  mutes(v.server_mutes, out.serverMutes);
  mutes(v.channel_mutes, out.channelMutes);
  levels(v.server, out.server, out.serverMutes);
  levels(v.channel, out.channel, out.channelMutes);
  return out;
}

/**
 * Write the key back, keeping anything else another client stored in it, levels we don't know included.
 * The old `muted` level isn't kept: it reads as a mute, which is written in the mute maps.
 */
export function writeNotifications(raw: string | undefined, s: NotificationSettings): string {
  let v: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(raw ?? '{}') as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) v = parsed as Record<string, unknown>;
  } catch {
    // Unreadable: start afresh.
  }
  const others = (src: unknown) => Object.fromEntries(Object.entries((src ?? {}) as Record<string, unknown>)
    .filter(([, level]) => typeof level !== 'string' || (!LEVELS.has(level) && level !== 'muted')));
  return JSON.stringify({
    ...v,
    server: { ...others(v.server), ...s.server },
    channel: { ...others(v.channel), ...s.channel },
    server_mutes: s.serverMutes,
    channel_mutes: s.channelMutes,
  });
}

export const muteActive = (m: Mute | undefined, now: number) => !!m && (m.until === undefined || m.until > now);

/** The end of the soonest timed mute still running, so a clock can wake then. */
export function nextMuteEnd(s: NotificationSettings, now: number): number | undefined {
  const ends = [...Object.values(s.serverMutes), ...Object.values(s.channelMutes)].map((m) => m.until).filter((u): u is number => !!u && u > now);
  return ends.length ? Math.min(...ends) : undefined;
}

/** Message flags, as Stoat sets them on the wire: bit indices 1, 2 and 3 (m2c-plan.md). */
export const Flags = { SuppressNotifications: 2, MentionsEveryone: 4, MentionsOnline: 8 } as const;

/** A user mention, a reply that mentions you, one of your roles, `@everyone` or `@online`. */
export function mentionsYou(m: Message, self: Id, roles: Id[]): boolean {
  const flags = m.flags ?? 0;
  return m.mentions.includes(self) || m.roleMentions.some((r) => roles.includes(r))
    || (flags & Flags.MentionsEveryone) !== 0 || (flags & Flags.MentionsOnline) !== 0;
}

/** Only your own ID: a user mention or a reply with mention on (decision 2). */
export const mentionsYouPersonally = (m: Message, self: Id) => m.mentions.includes(self);

export interface NotifyContext {
  self: Id;
  /** Your roles in the message's server, if it is in one. */
  roles: Id[];
  /** Your live presence, which covers a status set in another client. */
  presence: Presence | undefined;
  level: NotificationLevel;
  /** The channel, or for a server channel the server, is muted now. */
  muted: boolean;
  /** Whether the author is someone you blocked. */
  blocked: boolean;
  /** The channel a focused window of this browser shows, if any. */
  focusedChannel: Id | null;
}

export function shouldNotify(m: Message, c: NotifyContext): boolean {
  if (m.author === c.self || c.blocked || m.system) return false;
  if ((m.flags ?? 0) & Flags.SuppressNotifications) return false;
  if (c.focusedChannel === m.channel) return false;
  if (c.presence === 'Busy') return false;
  if (c.muted) return c.level !== 'none' && mentionsYouPersonally(m, c.self);
  const mention = mentionsYou(m, c.self, c.roles);
  if (c.level === 'none' || (c.level === 'mention' && !mention)) return false;
  if (c.presence === 'Focus' && !mention) return false;
  return true;
}
