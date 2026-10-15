/**
 * The layer's endpoints under /app/api/v1/ go through here: the session check, the caller's limit, errors as
 * `{ type }` and refusals logged without tokens. hooks.server.ts sets the one Layer at start, or none if it
 * couldn't start, and then every endpoint answers 503 LayerUnavailable.
 */
import { json, type RequestEvent } from '@sveltejs/kit';
import type { Caller, Layer, Use } from './layer.ts';
import { LayerError } from './util.ts';

let current: Layer | null = null;

export function setLayer(layer: Layer): void {
  current = layer;
}

const NO_STORE = { 'cache-control': 'no-store' };

function refusal(e: unknown, event: RequestEvent, caller: Caller | null): Response {
  if (!(e instanceof LayerError)) {
    console.error(`layer: ${event.request.method} ${event.url.pathname} failed:`, e instanceof Error ? e.message : e);
    return json({ type: 'InternalError' }, { status: 500, headers: NO_STORE });
  }
  // A 401 is an expired session, which is routine; the rest are worth seeing. Never the token.
  if (e.status !== 401) {
    const who = caller ? `user ${caller.id}` : `address ${event.getClientAddress()}`;
    console.log(`layer: ${e.status} ${e.type} ${event.request.method} ${event.url.pathname} ${who}`);
  }
  const headers: Record<string, string> = { ...NO_STORE };
  if (e.status === 429 && typeof e.extra.retry_after === 'number') headers['retry-after'] = String(Math.ceil(e.extra.retry_after / 1000));
  return json({ type: e.type, ...e.extra }, { status: e.status, headers });
}

function layer(): Layer {
  if (!current) throw new LayerError(503, 'LayerUnavailable');
  return current;
}

/** An endpoint for signed-in callers, counted against their `use` limit. */
export function endpoint(use: Use, handler: (ctx: { event: RequestEvent; layer: Layer; caller: Caller }) => unknown | Promise<unknown>) {
  return async (event: RequestEvent): Promise<Response> => {
    let caller: Caller | null = null;
    try {
      const l = layer();
      caller = await l.authenticate(event.request.headers.get('x-session-token'), event.getClientAddress());
      l.limit(caller, use);
      const body = await handler({ event, layer: l, caller });
      return body instanceof Response ? body : json(body, { headers: NO_STORE });
    } catch (e) {
      return refusal(e, event, caller);
    }
  };
}

/** An endpoint anyone may call, such as /health. */
export function publicEndpoint(handler: (ctx: { event: RequestEvent; layer: Layer }) => unknown | Promise<unknown>) {
  return async (event: RequestEvent): Promise<Response> => {
    try {
      const body = await handler({ event, layer: layer() });
      return body instanceof Response ? body : json(body, { headers: NO_STORE });
    } catch (e) {
      return refusal(e, event, null);
    }
  };
}
