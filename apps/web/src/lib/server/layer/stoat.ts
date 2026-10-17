/**
 * The layer's few calls to Stoat, over the stack's internal network (architecture section 11.1), always as the
 * caller. Only a definite answer counts: a timeout, a network error, a 5xx or a 429 is never read as "no".
 */
import { isUlid } from '@concord/domain';
import { LayerError } from './util.ts';

/** Stoat's wire shapes, only the fields the layer reads. The mappers in @concord/stoat take the full objects. */
export interface StoatUser { _id: string; username: string }
export type WireServer = Parameters<typeof import('@concord/stoat').mapServer>[0];
export type WireMember = Parameters<typeof import('@concord/stoat').mapMember>[0];

const TIMEOUT_MS = 3_000;

/** Stoat down, slow or answering 5xx: 503, never a sign-out. */
export const stoatUnavailable = () => new LayerError(503, 'StoatUnavailable');

export class StoatClient {
  private readonly base: string;
  private readonly fetch: typeof fetch;

  constructor(base: string, fetchFn: typeof fetch = fetch) {
    this.base = base.replace(/\/$/, '');
    this.fetch = fetchFn;
  }

  /** GETs a path and returns the status with the JSON body for 2xx, or throws for anything that isn't an answer. */
  private async get(path: string, token?: string): Promise<{ status: number; body: unknown }> {
    let res: Response;
    try {
      res = await this.fetch(`${this.base}${path}`, {
        headers: token ? { 'x-session-token': token } : {},
        signal: AbortSignal.timeout(TIMEOUT_MS),
        // Never follow a redirect with the caller's token.
        redirect: 'manual',
      });
    } catch {
      throw stoatUnavailable();
    }
    if (res.status === 429) {
      // Stoat's limits are per user, so the caller's own client shares this bucket: pass the wait on.
      const after = Number(res.headers.get('x-ratelimit-reset-after')) || 1_000;
      await res.body?.cancel();
      throw new LayerError(429, 'RateLimited', { retry_after: after });
    }
    if (res.status >= 500) {
      await res.body?.cancel();
      throw stoatUnavailable();
    }
    if (res.status >= 300 && res.status < 400) {
      await res.body?.cancel();
      throw stoatUnavailable();
    }
    if (!res.ok) {
      await res.body?.cancel();
      return { status: res.status, body: null };
    }
    try {
      return { status: res.status, body: await res.json() };
    } catch {
      throw stoatUnavailable();
    }
  }

  /** Account creation is only exposed through a claimed, approved beta invitation. Never resets accounts. */
  async createBetaAccount(email: string, password: string): Promise<void> {
    let res: Response;
    try {
      res = await this.fetch(`${this.base}/auth/account/create`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }), redirect: 'manual', signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new LayerError(503, 'InvitationNeedsHelp');
    }
    if (res.status === 204) return;
    const data = await res.json().catch(() => null) as { type?: string; error?: string } | null;
    if (res.status === 429) throw new LayerError(429, 'RateLimited');
    const kind = data?.type ?? data?.error;
    if (kind && ['ShortPassword', 'CompromisedPassword', 'InvalidEmail'].includes(kind)) throw new LayerError(400, kind);
    if (kind === 'AccountExists' || kind === 'EmailAlreadyInUse') throw new LayerError(409, 'AccountExists');
    throw new LayerError(503, 'InvitationNeedsHelp');
  }

  /** The token's user, or null when Stoat rejects the token. */
  async me(token: string): Promise<StoatUser | null> {
    const { status, body } = await this.get('/users/@me', token);
    if (status === 401) return null;
    const user = body as StoatUser | null;
    if (status !== 200 || !user || !isUlid(user._id)) throw stoatUnavailable();
    return user;
  }

  /** Who may create servers: `restrict_server_creation` from `GET /`. */
  async serverCreators(): Promise<string[]> {
    const { status, body } = await this.get('/');
    if (status !== 200) throw stoatUnavailable();
    const list = (body as { features?: { limits?: { global?: { restrict_server_creation?: unknown } } } })
      .features?.limits?.global?.restrict_server_creation;
    return Array.isArray(list) ? list.filter(isUlid) : [];
  }

  /** The server as the caller sees it, or null when the caller can't see it. IDs must already be checked. */
  async server(token: string, server: string): Promise<WireServer | null> {
    const { status, body } = await this.get(`/servers/${server}`, token);
    return status === 200 ? (body as WireServer) : null;
  }

  /** A custom emoji's server, or null when there is no such emoji or it belongs to no server. */
  async emojiServer(token: string, emoji: string): Promise<string | null> {
    const { status, body } = await this.get(`/custom/emoji/${emoji}`, token);
    const parent = status === 200 ? (body as { parent?: { type?: string; id?: string } }).parent : undefined;
    return parent?.type === 'Server' && parent.id ? parent.id : null;
  }

  /** The caller's member record in a server, or null when they aren't a member. */
  async member(token: string, server: string, user: string): Promise<WireMember | null> {
    const { status, body } = await this.get(`/servers/${server}/members/${user}`, token);
    return status === 200 ? (body as WireMember) : null;
  }
}
