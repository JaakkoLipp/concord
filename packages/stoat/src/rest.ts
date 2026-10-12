/**
 * REST wrapper (client.md section 4.4): session header, waiting out exhausted rate-limit buckets,
 * one retry on 429, and errors normalised to StoatError.
 */
import { BackendError } from '@concord/domain/errors';
import { routeOf } from './route.ts';
import type { HttpResponse, Transport } from './transport.ts';

/** An HTTP error from Stoat. `kind` is Stoat's error type, such as InvalidCredentials or MissingPermission. */
export class StoatError extends BackendError {
  readonly body: unknown;
  constructor(status: number, body: unknown, what: string) {
    const kind = (body as { type?: string } | null)?.type ?? `HTTP${status}`;
    super(status, kind, `${what}: ${status} ${kind}`);
    this.body = body;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Rest {
  private token: string | null = null;
  private readonly transport: Transport;
  /** Route template to Stoat's bucket ID, learned from responses. */
  private readonly routeBuckets = new Map<string, string>();
  private readonly buckets = new Map<string, { remaining: number; resetAt: number }>();

  constructor(transport: Transport) {
    this.transport = transport;
  }

  setToken(token: string | null): void {
    this.token = token;
  }

  async request<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
    const route = routeOf(method, path);
    for (let attempt = 0; ; attempt++) {
      await this.waitForBucket(route);
      const res = await this.transport.request({
        method, path,
        headers: { ...(this.token ? { 'x-session-token': this.token } : {}), ...headers },
        ...(body === undefined ? {} : { body }),
      });
      this.learn(route, res);
      if (res.status === 429 && attempt === 0) {
        const after = Number((res.body as { retry_after?: number } | null)?.retry_after ?? res.headers['x-ratelimit-reset-after'] ?? 1000);
        await sleep(after + 50);
        continue;
      }
      if (res.status >= 400) throw new StoatError(res.status, res.body, `${method} ${path.split('?')[0]}`);
      return res.body as T;
    }
  }

  private async waitForBucket(route: string): Promise<void> {
    const id = this.routeBuckets.get(route);
    const b = id ? this.buckets.get(id) : undefined;
    if (b && b.remaining <= 0 && b.resetAt > Date.now()) await sleep(b.resetAt - Date.now() + 20);
  }

  private learn(route: string, res: HttpResponse): void {
    const id = res.headers['x-ratelimit-bucket'];
    const remaining = res.headers['x-ratelimit-remaining'];
    const reset = res.headers['x-ratelimit-reset-after'];
    if (!id || remaining === undefined || reset === undefined) return;
    this.routeBuckets.set(route, id);
    this.buckets.set(id, { remaining: Number(remaining), resetAt: Date.now() + Number(reset) });
  }
}
