/**
 * An error the backend answered with, as opposed to a network failure or timeout, where the request
 * may or may not have reached it. Backends throw subclasses of this for every HTTP error.
 */
export class BackendError extends Error {
  readonly status: number;
  /** The backend's error type, such as MissingPermission or PayloadTooLarge. */
  readonly kind: string;
  constructor(status: number, kind: string, message: string) {
    super(message);
    this.status = status;
    this.kind = kind;
  }
}
