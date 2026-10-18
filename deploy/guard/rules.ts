/**
 * The history guard's rules (m4.7-plan.md task 12), apart from Stoat so they can be tested. Each audit log entry becomes
 * tallies of what one person did to others; a tally is judged against that person's tallies before it, in windows that
 * end at the entry's own time, so a guard catching up after a restart judges exactly as it would have live.
 */

export interface Limits {
  /** More than this many of others' messages deleted in 10 minutes, or in 24 hours, strips. */
  messages10m: number;
  messages24h: number;
  /** More bulk deletions than this in 10 minutes strips: by default the second. */
  bulk10m: number;
  /** More channel deletions than this in 24 hours strips; the ones before only alert. */
  channels24h: number;
  /** More bans than this in 10 minutes strips. */
  bans10m: number;
}

export const DEFAULT_LIMITS: Limits = { messages10m: 25, messages24h: 150, bulk10m: 1, channels24h: 1, bans10m: 3 };

/** Limits from the environment (host.env), falling back to the defaults for anything missing or not a whole number. */
export function limitsFrom(env: Record<string, string | undefined>): Limits {
  const n = (key: string, fallback: number) => {
    const v = Number(env[key]);
    return Number.isInteger(v) && v >= 0 ? v : fallback;
  };
  return {
    messages10m: n('GUARD_MESSAGES_10M', DEFAULT_LIMITS.messages10m),
    messages24h: n('GUARD_MESSAGES_24H', DEFAULT_LIMITS.messages24h),
    bulk10m: n('GUARD_BULK_10M', DEFAULT_LIMITS.bulk10m),
    channels24h: n('GUARD_CHANNELS_24H', DEFAULT_LIMITS.channels24h),
    bans10m: n('GUARD_BANS_10M', DEFAULT_LIMITS.bans10m),
  };
}

export type Kind = 'message' | 'bulk' | 'channel' | 'ban' | 'role';
export interface Tally { user: string; kind: Kind; at: number; n: number; entry: string; channel?: string }
export interface Verdict { action: 'strip' | 'alert' | 'none'; reason: string }

const MINUTE = 60_000;
const WINDOW_10M = 10 * MINUTE;
export const WINDOW_24H = 24 * 60 * MINUTE;

/** The time a ULID was made, from its first 10 characters. */
export function ulidTime(id: string): number {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let t = 0;
  for (const c of id.slice(0, 10).toUpperCase()) t = t * 32 + alphabet.indexOf(c);
  return t;
}

/** Stoat's audit log entry, only what the guard reads. */
export interface WireEntry {
  _id: string;
  user: string;
  action: { type: string; channel?: string; count?: number };
}

/**
 * What an entry counts for. Stoat logs only the deletion of someone else's message, never your own, so every message
 * counted is someone else's. A bulk deletion counts once as a bulk deletion and once per message.
 */
export function tallies(e: WireEntry): Tally[] {
  const base = { user: e.user, at: ulidTime(e._id), entry: e._id, ...(e.action.channel ? { channel: e.action.channel } : {}) };
  switch (e.action.type) {
    case 'MessageDelete': return [{ ...base, kind: 'message', n: 1 }];
    case 'MessageBulkDelete': return [{ ...base, kind: 'bulk', n: 1 }, { ...base, kind: 'message', n: e.action.count ?? 0 }];
    case 'ChannelDelete': return [{ ...base, kind: 'channel', n: 1 }];
    case 'BanCreate': return [{ ...base, kind: 'ban', n: 1 }];
    case 'RoleDelete': return [{ ...base, kind: 'role', n: 1 }];
    default: return [];
  }
}

const sum = (history: Tally[], next: Tally, kind: Kind, window: number) =>
  history.filter((t) => t.user === next.user && t.kind === kind && t.at > next.at - window && t.at <= next.at).reduce((s, t) => s + t.n, 0) + next.n;

/** Judge one tally against that person's earlier ones. */
export function judge(history: Tally[], next: Tally, limits: Limits): Verdict {
  switch (next.kind) {
    case 'message': {
      const ten = sum(history, next, 'message', WINDOW_10M);
      if (ten > limits.messages10m) return { action: 'strip', reason: `deleted ${ten} of others’ messages in 10 minutes` };
      const day = sum(history, next, 'message', WINDOW_24H);
      if (day > limits.messages24h) return { action: 'strip', reason: `deleted ${day} of others’ messages in 24 hours` };
      return { action: 'none', reason: '' };
    }
    case 'bulk': {
      const ten = sum(history, next, 'bulk', WINDOW_10M);
      return ten > limits.bulk10m ? { action: 'strip', reason: `made ${ten} bulk deletions in 10 minutes` } : { action: 'none', reason: '' };
    }
    case 'channel': {
      const day = sum(history, next, 'channel', WINDOW_24H);
      return day > limits.channels24h
        ? { action: 'strip', reason: `deleted ${day} channels in 24 hours` }
        // The guard can't tell an empty channel from a full one, so the first only alerts.
        : { action: 'alert', reason: 'deleted a channel' };
    }
    case 'ban': {
      const ten = sum(history, next, 'ban', WINDOW_10M);
      return ten > limits.bans10m ? { action: 'strip', reason: `banned ${ten} people in 10 minutes` } : { action: 'none', reason: '' };
    }
    case 'role':
      return { action: 'strip', reason: 'deleted a role' };
  }
}

/** Tallies older than the longest window can't count again. */
export const prune = (history: Tally[], now: number) => history.filter((t) => t.at > now - WINDOW_24H);
