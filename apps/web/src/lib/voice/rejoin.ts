/**
 * The call's life and the rejoin rule (client.md sections 10.2 and 10.7, m4-plan.md task 9), as a pure state
 * machine: the controller feeds it what happened and does what it says.
 *
 * LiveKit recovers a dropped connection on its own, first by resuming and then by a full restart. When it gives
 * up, or the server ends the room, the client fetches a new token and joins again, backing off at 1, 2, 5, 10
 * and 30 seconds for up to 5 minutes. A removal by the server is never rejoined: another device taking the
 * call, a kick, a ban, a permission change and voice-ingress's own disconnects all arrive as one. Nor is a join
 * sooner than 10 s after the last one that succeeded, so two devices can never evict each other in a loop.
 */
import type { Id } from '@concord/domain';

export const REJOIN_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 30_000];
export const REJOIN_FOR_MS = 5 * 60_000;
/** No automatic join this soon after the last successful one. */
export const REJOIN_GAP_MS = 10_000;

/**
 * LiveKit's DisconnectReason values (@livekit/protocol 1.52.1, in livekit-client 2.22.4). Copied, so this
 * module doesn't load livekit-client; a test checks them against the SDK.
 */
export const LK_REASON = {
  UNKNOWN_REASON: 0, CLIENT_INITIATED: 1, DUPLICATE_IDENTITY: 2, SERVER_SHUTDOWN: 3, PARTICIPANT_REMOVED: 4, ROOM_DELETED: 5,
  STATE_MISMATCH: 6, JOIN_FAILURE: 7, MIGRATION: 8, SIGNAL_CLOSE: 9, ROOM_CLOSED: 10, CONNECTION_TIMEOUT: 14, MEDIA_FAILURE: 15,
} as const;

/** How a call ended: by this client, by the server removing us, or by the connection. */
export type EndCause = 'user' | 'removed' | 'connection';

export function endCause(reason: number | undefined): EndCause {
  if (reason === LK_REASON.CLIENT_INITIATED) return 'user';
  if (reason === LK_REASON.PARTICIPANT_REMOVED || reason === LK_REASON.DUPLICATE_IDENTITY) return 'removed';
  // Everything else is the connection or the room going away, a LiveKit restart included.
  return 'connection';
}

export type Phase =
  /** Not in a call. */
  | 'idle'
  /** Fetching a token and connecting: the first join, or a rejoin when `lostAt` is set. */
  | 'connecting'
  | 'connected'
  /** LiveKit is resuming or restarting the connection itself. */
  | 'reconnecting'
  /** Waiting until `retryAt` to rejoin. */
  | 'waiting'
  /** Ended without the user, and not rejoined. The panel offers Rejoin. */
  | 'disconnected';

/** Why the call is `disconnected`. */
export type EndReason = 'removed' | 'gave-up' | 'refused';

export interface CallState {
  phase: Phase;
  channel: Id | null;
  /** When the call was lost, while rejoining. */
  lostAt: number | null;
  /** Rejoin attempts so far since `lostAt`. */
  attempt: number;
  /** When a join last succeeded. */
  joinedAt: number | null;
  retryAt: number | null;
  reason: EndReason | null;
}

export type CallEvent =
  | { type: 'join'; channel: Id }
  | { type: 'connected' }
  | { type: 'reconnecting' }
  | { type: 'reconnected' }
  | { type: 'ended'; cause: EndCause }
  /** A join attempt failed. `final` when retrying can't help. */
  | { type: 'failed'; final: boolean }
  /** The wait before a rejoin is over. */
  | { type: 'retry' }
  | { type: 'leave' };

/** What the controller must do after a step: start a join, or wake the machine with `retry` after `ms`. */
export type Effect = { type: 'connect' } | { type: 'wait'; ms: number } | null;

export const initial: CallState = { phase: 'idle', channel: null, lostAt: null, attempt: 0, joinedAt: null, retryAt: null, reason: null };

export function step(s: CallState, e: CallEvent, now: number): [CallState, Effect] {
  switch (e.type) {
    case 'join':
      // A join the user asked for, a Rejoin click included, is never held back.
      return [{ ...s, phase: 'connecting', channel: e.channel, lostAt: null, attempt: 0, retryAt: null, reason: null }, { type: 'connect' }];
    case 'leave':
      return [{ ...initial, joinedAt: s.joinedAt }, null];
    case 'connected':
      if (s.phase !== 'connecting') return [s, null];
      return [{ ...s, phase: 'connected', lostAt: null, attempt: 0, joinedAt: now, retryAt: null }, null];
    case 'reconnecting':
      return s.phase === 'connected' ? [{ ...s, phase: 'reconnecting' }, null] : [s, null];
    case 'reconnected':
      return s.phase === 'reconnecting' ? [{ ...s, phase: 'connected' }, null] : [s, null];
    case 'ended':
      if (s.phase === 'idle' || s.phase === 'disconnected') return [s, null];
      if (e.cause === 'user') return [{ ...initial, joinedAt: s.joinedAt }, null];
      if (e.cause === 'removed') return [{ ...s, phase: 'disconnected', lostAt: null, retryAt: null, reason: 'removed' }, null];
      // A connection that ends while a join is in flight counts as that attempt failing.
      return wait({ ...s, lostAt: s.lostAt ?? now }, now);
    case 'failed':
      if (s.phase !== 'connecting') return [s, null];
      // The first join failing is the user's to retry; the UI says why.
      if (s.lostAt === null) return [{ ...initial, joinedAt: s.joinedAt }, null];
      if (e.final) return [{ ...s, phase: 'disconnected', lostAt: null, retryAt: null, reason: 'refused' }, null];
      return wait(s, now);
    case 'retry':
      if (s.phase !== 'waiting') return [s, null];
      if (s.retryAt !== null && now < s.retryAt) return [s, { type: 'wait', ms: s.retryAt - now }];
      return [{ ...s, phase: 'connecting', attempt: s.attempt + 1, retryAt: null }, { type: 'connect' }];
  }
}

/** Schedule the next rejoin, or give up when it would fall outside the 5 minutes. */
function wait(s: CallState, now: number): [CallState, Effect] {
  const lostAt = s.lostAt ?? now;
  const delay = REJOIN_DELAYS_MS[Math.min(s.attempt, REJOIN_DELAYS_MS.length - 1)]!;
  const retryAt = Math.max(now + delay, (s.joinedAt ?? 0) + REJOIN_GAP_MS);
  if (retryAt - lostAt > REJOIN_FOR_MS) return [{ ...s, phase: 'disconnected', lostAt: null, retryAt: null, reason: 'gave-up' }, null];
  return [{ ...s, phase: 'waiting', lostAt, retryAt }, { type: 'wait', ms: retryAt - now }];
}

/** What the voice panel shows. */
export type Shown = 'none' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export function shown(s: CallState): Shown {
  switch (s.phase) {
    case 'idle': return 'none';
    case 'connecting': return s.lostAt === null ? 'connecting' : 'reconnecting';
    case 'connected': return 'connected';
    case 'reconnecting': case 'waiting': return 'reconnecting';
    case 'disconnected': return 'disconnected';
  }
}

/** The channel being rejoined, if any, so a ring for it can be ignored (client.md section 10.8). */
export const rejoining = (s: CallState): Id | null => (s.phase === 'reconnecting' || s.lostAt !== null ? s.channel : null);

/**
 * Whether a removal was another device taking the call: our own voice state, as Stoat reports it, shows a
 * join newer than the one we had when removed. A kick or a ban leaves no newer join behind.
 */
export function movedElsewhere(before: { joinedAt: number } | null, now: { joinedAt: number } | null): boolean {
  return !!now && (!before || now.joinedAt !== before.joinedAt);
}
