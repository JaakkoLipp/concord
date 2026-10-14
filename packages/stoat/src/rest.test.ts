/**
 * The REST layer's rate-limit buckets (m2c-plan.md task 1), against a fake Stoat that enforces fixed
 * 10-second windows as Stoat does, on fake timers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RETRY_FOR_MS, Rest, StoatError } from './rest.ts';
import type { HttpRequest, HttpResponse, Transport } from './transport.ts';

const S1 = '01M4WPBMZWYQ9GB009CG8FDEZA';
const S2 = '01M4WPP052QD9Y90CYPFKSAGBP';
const C1 = '01M4WPBMZW1D977DMJNR76RZQE';

/** A fake Stoat: per bucket, `limit` requests a 10 s window, answering after `latency` ms. */
function fakeStoat(opts: { latency?: number; fail?: (req: HttpRequest) => HttpResponse | null } = {}) {
  const windows = new Map<string, { start: number; used: number }>();
  const seen: { req: HttpRequest; status: number; at: number }[] = [];
  const bucketOf = (path: string): [string, number] => {
    const server = /^\/servers\/(\w{26})/.exec(path);
    if (server) return [`s-${server[1]}`, 5];
    const channel = /^\/channels\/(\w{26})/.exec(path);
    if (channel) return [`c-${channel[1]}`, 15];
    return ['any', 20];
  };
  const transport: Transport = {
    async request(req) {
      await new Promise((r) => setTimeout(r, opts.latency ?? 30));
      const [id, limit] = bucketOf(req.path);
      const now = Date.now();
      let w = windows.get(id);
      if (!w || now - w.start >= 10_000) windows.set(id, (w = { start: now, used: 0 }));
      const reset = String(w.start + 10_000 - now);
      if (w.used >= limit) {
        seen.push({ req, status: 429, at: now });
        return { status: 429, headers: { 'x-ratelimit-bucket': id, 'x-ratelimit-limit': String(limit), 'x-ratelimit-remaining': '0', 'x-ratelimit-reset-after': reset }, body: { retry_after: Number(reset) } };
      }
      w.used++;
      const failed = opts.fail?.(req);
      seen.push({ req, status: failed?.status ?? 200, at: now });
      const headers = { 'x-ratelimit-bucket': id, 'x-ratelimit-limit': String(limit), 'x-ratelimit-remaining': String(limit - w.used), 'x-ratelimit-reset-after': reset };
      return failed ? { ...failed, headers } : { status: 200, headers, body: { ok: req.path } };
    },
    connect: () => Promise.reject(new Error('no socket')),
  };
  return { transport, seen };
}

describe('Rest buckets', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('sends a burst of server edits within the limit, waiting rather than failing', async () => {
    const { transport, seen } = fakeStoat();
    const rest = new Rest(transport);
    // Different routes, one server: Stoat counts them in one bucket of 5.
    const calls = [
      rest.request('PATCH', `/servers/${S1}`), rest.request('POST', `/servers/${S1}/roles`),
      ...Array.from({ length: 10 }, (_, i) => rest.request('PATCH', `/servers/${S1}/roles/0${i}M4WPBPAWQZ7A38KXK7XMK4T`)),
    ];
    const done = Promise.all(calls);
    await vi.advanceTimersByTimeAsync(25_000);
    await expect(done).resolves.toHaveLength(12);
    expect(seen.filter((s) => s.status === 429)).toHaveLength(0);
    expect(seen.filter((s) => s.at < 10_000 + seen[0]!.at)).toHaveLength(5);
  });

  it('keeps servers apart', async () => {
    const { transport, seen } = fakeStoat();
    const rest = new Rest(transport);
    const done = Promise.all([...Array.from({ length: 5 }, () => rest.request('PATCH', `/servers/${S1}`)), ...Array.from({ length: 5 }, () => rest.request('PATCH', `/servers/${S2}`))]);
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(done).resolves.toHaveLength(10);
    expect(seen).toHaveLength(10);
  });

  it('learns other buckets from their first answer and holds the rest back', async () => {
    const { transport, seen } = fakeStoat();
    const rest = new Rest(transport);
    await (async () => { const p = rest.request('PATCH', `/channels/${C1}`); await vi.advanceTimersByTimeAsync(100); await p; })();
    const done = Promise.all(Array.from({ length: 20 }, () => rest.request('PUT', `/channels/${C1}/permissions/default`)));
    await vi.advanceTimersByTimeAsync(25_000);
    await expect(done).resolves.toHaveLength(20);
    // The channel's bucket is shared by its routes; only the requests sent before it was learned may 429.
    expect(seen.filter((s) => s.status === 429)).toHaveLength(0);
  });

  it('retries a 429 more than once, then gives up', async () => {
    const { transport } = fakeStoat({ fail: () => ({ status: 429, headers: {}, body: { retry_after: 20_000 } }) });
    const rest = new Rest(transport);
    const done = rest.request('PATCH', `/servers/${S1}`).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(RETRY_FOR_MS + 30_000);
    const e = await done;
    expect(e).toBeInstanceOf(StoatError);
    expect((e as StoatError).status).toBe(429);
  });

  it('surfaces any other error at once', async () => {
    const { transport, seen } = fakeStoat({ fail: () => ({ status: 403, headers: {}, body: { type: 'NotElevated' } }) });
    const rest = new Rest(transport);
    const done = rest.request('PATCH', `/servers/${S1}/roles/x`).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(100);
    expect(((await done) as StoatError).kind).toBe('NotElevated');
    expect(seen).toHaveLength(1);
  });
});
