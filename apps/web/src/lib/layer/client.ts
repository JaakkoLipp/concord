/**
 * The client of Concord's own layer at /app/api/v1/ (architecture section 11). The session token goes in a header,
 * never a cookie. Only the layer's own 401 signs out: a 503 means Stoat failed, and must never log anyone out.
 */
import { BackendError } from '@concord/domain/errors';
import type { Layer, LayerMe } from '@concord/domain';

export class HttpLayer implements Layer {
  private readonly token: () => string | null;
  private readonly onSignedOut: () => void;
  private readonly fetch: typeof fetch;

  constructor(token: () => string | null, onSignedOut: () => void, fetchFn: typeof fetch = (...a) => fetch(...a)) {
    this.token = token;
    this.onSignedOut = onSignedOut;
    this.fetch = fetchFn;
  }

  private async get<T>(path: string): Promise<T> {
    const token = this.token();
    const res = await this.fetch(`/app/api/v1${path}`, { headers: token ? { 'x-session-token': token } : {} });
    if (res.ok) return (await res.json()) as T;
    const body = (await res.json().catch(() => null)) as { type?: unknown } | null;
    const type = typeof body?.type === 'string' ? body.type : `HTTP${res.status}`;
    if (res.status === 401 && type === 'InvalidSession') this.onSignedOut();
    throw new BackendError(res.status, type, `layer ${path}: ${res.status} ${type}`);
  }

  me(): Promise<LayerMe> {
    return this.get('/me');
  }
}
