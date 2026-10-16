/**
 * Following a move (m4.7-plan.md task 2). A moderator moves someone with a member edit; Stoat sends the moved
 * user a private `UserMoveVoiceChannel` with a token for the new room, about 100 ms before LiveKit removes them
 * from the old one, with the same reason as a kick (m4.7-results.md, task 1). So the event is what tells a move
 * from a kick, and the token is good for 10 s.
 */
import type { Id } from '@concord/domain';

/** A token this much short of expiring is not worth connecting with. */
const MARGIN_MS = 1_500;

/** When a LiveKit access token expires, from its `exp` claim, or null when it has none. */
export function tokenExpiry(token: string): number | null {
  try {
    const claims = JSON.parse(atob(token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: unknown };
    return typeof claims.exp === 'number' ? claims.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** Whether a move's token can still join. A token that can't be read is tried anyway. */
export function tokenUsable(token: string, now: number): boolean {
  const exp = tokenExpiry(token);
  return exp === null || now + MARGIN_MS < exp;
}

/**
 * Whether a move concerns the call this client has. `current` is the channel it is in or joining, and `leaving`
 * the one it left when it followed a move not yet finished: a second move made before the first one connected
 * names that channel as `from`, since Stoat only changes the user's state when they connect.
 */
export function movesThisCall(from: Id, current: Id | null, leaving: Id | null): boolean {
  return current !== null && (from === current || from === leaving);
}
