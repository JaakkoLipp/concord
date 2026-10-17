/**
 * REST wrapper (client.md section 4.4): session header, rate-limit buckets, retries on 429, and errors
 * normalised to StoatError.
 */
import { BackendError } from '@concord/domain/errors';
import { ULID_PATTERN } from '@concord/domain';
import { routeOf } from './route.ts';
import type { HttpResponse, Transport } from './transport.ts';

/** An HTTP error from Stoat. `kind` is Stoat's error type, such as InvalidCredentials or MissingPermission. */
export class StoatError extends BackendError {
  readonly body: unknown;
  constructor(status: number, body: unknown, what: string) {
    const kind = (body as { type?: string } | null)?.type ?? `HTTP${status}`;
    // MissingPermission names the permission, such as MentionEveryone for a refused @everyone.
    super(status, kind, `${what}: ${status} ${kind}`, (body as { permission?: string } | null)?.permission);
    this.body = body;
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** A 429 is retried after its wait until this much time has gone by in all. */
export const RETRY_FOR_MS = 60_000;
/**
 * Every `/servers/{id}/…` route, and the server itself, shares one bucket per user and server: 5 requests
 * a 10 s (m2c-plan.md, checked live). Known up front, so a burst of admin saves waits instead of failing.
 */
const SERVER_LIMIT = 5;
const SERVER_PATH = new RegExp(`^/servers/(${ULID_PATTERN})(?:/|$)`);
/**
 * Stoat's window ends up to a second after its `x-ratelimit-reset-after` says (m2c-results.md task 3,
 * measured live), so a bucket is taken as reset only this much later.
 */
const RESET_SLACK_MS = 1_000;

interface Bucket {
  /** Requests a window, once known. Until then the bucket lets one request through at a time. */
  limit?: number;
  remaining: number;
  /** When the window resets, as Date.now() time. */
  resetAt: number;
  inFlight: number;
  /** Requests waiting for room, woken when a request ends. */
  waiters: (() => void)[];
}

export class Rest {
  private token: string | null = null;
  private readonly transport: Transport;
  /** A request's key to the bucket Stoat named for it, learned from responses. */
  private readonly named = new Map<string, string>();
  private readonly buckets = new Map<string, Bucket>();

  constructor(transport: Transport) {
    this.transport = transport;
  }

  /** Bumped on every token change, so a request queued for one account never goes out as another. */
  private generation = 0;

  setToken(token: string | null): void {
    if (token === this.token) return;
    this.token = token;
    this.generation++;
    // Buckets are per account.
    this.buckets.clear();
    this.named.clear();
  }

  async request<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
    const key = this.keyOf(method, path);
    const token = this.token;
    const generation = this.generation;
    /** When the first attempt went out: the retry budget doesn't count time spent queueing. */
    let started = 0;
    for (;;) {
      const bucket = await this.room(key);
      if (generation !== this.generation) {
        bucket.inFlight--;
        this.wake(bucket);
        throw new StoatError(401, { type: 'SignedOut' }, `${method} ${path.split('?')[0]}`);
      }
      started ||= Date.now();
      let res: HttpResponse;
      try {
        res = await this.transport.request({
          method, path,
          headers: { ...(token ? { 'x-session-token': token } : {}), ...headers },
          ...(body === undefined ? {} : { body }),
        });
        // What Stoat says is left counts this request already, so learn it before freeing the slot.
        this.learn(key, res);
      } finally {
        bucket.inFlight--;
        this.wake(bucket);
      }
      // Slow mode also answers 429, with its wait in seconds. Retrying wouldn't help the composer, which counts it down.
      if (res.status === 429 && (res.body as { type?: string } | null)?.type !== 'InSlowmode') {
        const after = Number((res.body as { retry_after?: number } | null)?.retry_after ?? res.headers['x-ratelimit-reset-after'] ?? 1000);
        const b = this.bucketOf(key);
        b.remaining = 0;
        b.resetAt = Math.max(b.resetAt, Date.now() + after);
        if (Date.now() + after - started <= RETRY_FOR_MS) continue;
      }
      if (res.status >= 400) throw new StoatError(res.status, res.body, `${method} ${path.split('?')[0]}`);
      return res.body as T;
    }
  }

  /**
   * Requests for one server share a key. Anything else keys on its route and its first ID, so one channel's
   * bucket never holds back another's.
   */
  private keyOf(method: string, path: string): string {
    const server = SERVER_PATH.exec(path.split('?')[0]!);
    if (server) return `server:${server[1]}`;
    const id = /[0-9A-HJKMNP-TV-Z]{26}/.exec(path)?.[0] ?? '';
    return `${routeOf(method, path)}#${id}`;
  }

  private bucketOf(key: string): Bucket {
    const id = key.startsWith('server:') ? key : this.named.get(key) ?? key;
    let b = this.buckets.get(id);
    if (!b) {
      b = { remaining: 0, resetAt: 0, inFlight: 0, waiters: [] };
      if (key.startsWith('server:')) b.limit = b.remaining = SERVER_LIMIT;
      this.buckets.set(id, b);
    }
    return b;
  }

  /** Reserve a slot in the same step as the check, so a burst started together can't all see room. */
  private take(b: Bucket): Bucket {
    b.inFlight++;
    return b;
  }

  /** Wait until the bucket has room for one more request, counting those already on their way, and take it. */
  private async room(key: string): Promise<Bucket> {
    for (;;) {
      const b = this.bucketOf(key);
      const now = Date.now();
      // Not learned yet: one request at a time until the first answer says what the bucket allows, and
      // after a 429 without limits, not before it said to retry.
      if (b.limit === undefined) {
        if (b.resetAt > now) {
          await sleep(b.resetAt - now);
          continue;
        }
        if (b.inFlight === 0) return this.take(b);
        await new Promise<void>((r) => b.waiters.push(r));
        continue;
      }
      const left = (b.resetAt <= now ? b.limit : b.remaining) - b.inFlight;
      if (left > 0) return this.take(b);
      const waits: Promise<void>[] = [new Promise<void>((r) => b.waiters.push(r))];
      if (b.resetAt > now) waits.push(sleep(b.resetAt - now + 20));
      await Promise.race(waits);
    }
  }

  private wake(b: Bucket): void {
    const waiting = b.waiters.splice(0);
    for (const w of waiting) w();
  }

  private learn(key: string, res: HttpResponse): void {
    const id = res.headers['x-ratelimit-bucket'];
    const limit = res.headers['x-ratelimit-limit'];
    const remaining = res.headers['x-ratelimit-remaining'];
    const reset = res.headers['x-ratelimit-reset-after'];
    if (remaining === undefined || reset === undefined) {
      // A route Stoat doesn't limit: nothing to hold back once it has answered.
      const b = this.bucketOf(key);
      if (b.limit === undefined && res.status !== 429) b.limit = b.remaining = Number.POSITIVE_INFINITY;
      return;
    }
    if (id && !key.startsWith('server:') && this.named.get(key) !== id) {
      // First response for this key: from now on it shares the bucket Stoat named.
      const own = this.buckets.get(key);
      this.named.set(key, id);
      if (own) this.buckets.delete(key);
    }
    const b = this.bucketOf(key);
    if (limit !== undefined) b.limit = Number(limit);
    b.remaining = Number(remaining);
    b.resetAt = Date.now() + Number(reset) + RESET_SLACK_MS;
    this.wake(b);
  }
}
