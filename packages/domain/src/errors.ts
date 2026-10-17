/**
 * An error the backend answered with, as opposed to a network failure or timeout, where the request
 * may or may not have reached it. Backends throw subclasses of this for every HTTP error.
 */
export class BackendError extends Error {
  readonly status: number;
  /** The backend's error type, such as MissingPermission or PayloadTooLarge. */
  readonly kind: string;
  /** More about the error where the backend says it, such as the permission a MissingPermission names. */
  readonly detail: string | undefined;
  constructor(status: number, kind: string, message: string, detail?: string) {
    super(message);
    this.status = status;
    this.kind = kind;
    this.detail = detail;
  }
}

/**
 * Why joining a call failed (client.md section 10.2), in terms the UI can toast. `network` means the request
 * may not have reached the backend at all.
 */
export type JoinFailure =
  | 'no-permission' | 'full' | 'unavailable' | 'not-voice' | 'already-connected' | 'not-found' | 'rate-limited' | 'signed-out'
  | 'network' | 'unknown';

/** A refused `joinCall`. Backends throw this, with the reason already mapped, for every HTTP error of that call. */
export class JoinCallError extends BackendError {
  readonly reason: JoinFailure;
  constructor(status: number, kind: string, message: string, reason: JoinFailure) {
    super(status, kind, message);
    this.reason = reason;
  }
}

/** The reason a join failed, for anything a join can throw: the backend's answer, a network failure, or the connect after it. */
export function joinFailure(e: unknown): JoinFailure {
  if (e instanceof JoinCallError) return e.reason;
  if (e instanceof BackendError) return e.status === 401 ? 'signed-out' : 'unknown';
  return e instanceof TypeError ? 'network' : 'unknown';
}

/**
 * Failures that trying again can't fix, so an automatic rejoin stops at once. A full channel or an unavailable
 * voice server may clear up, so those are retried.
 */
export const isFinalJoinFailure = (f: JoinFailure): boolean =>
  f === 'no-permission' || f === 'not-voice' || f === 'not-found' || f === 'signed-out';
