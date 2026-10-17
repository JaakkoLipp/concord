/**
 * The client of Concord's own layer at /app/api/v1/ (architecture section 11). The session token goes in a header,
 * never a cookie. Only the layer's own 401 signs out: a 503 means Stoat failed, and must never log anyone out.
 */
import { BackendError } from '@concord/domain/errors';
import type { AccountAction, AccountActionResult, BetaInvitation, Id, Layer, LayerMe, PlatformUser, ServerInviteRequest, ServerTag } from '@concord/domain';

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
    return this.request<T>('GET', path);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = this.token();
    const headers: Record<string, string> = token ? { 'x-session-token': token } : {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await this.fetch(`/app/api/v1${path}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    if (res.status === 204) return undefined as T;
    if (res.ok) return (await res.json()) as T;
    const answer = (await res.json().catch(() => null)) as { type?: unknown } | null;
    const type = typeof answer?.type === 'string' ? answer.type : `HTTP${res.status}`;
    if (res.status === 401 && type === 'InvalidSession') this.onSignedOut();
    throw new BackendError(res.status, type, `layer ${path}: ${res.status} ${type}`);
  }

  me(): Promise<LayerMe> {
    return this.get('/me');
  }

  async betaInvitations(review = false): Promise<BetaInvitation[]> {
    return (await this.get<{ invitations: BetaInvitation[] }>(`/beta/invitations?review=${review}`)).invitations;
  }

  requestBetaInvitation(email: string): Promise<BetaInvitation> {
    return this.request('POST', '/beta/invitations', { email });
  }

  reviewBetaInvitation(id: string, action: 'approve' | 'decline'): Promise<void> {
    return this.request('POST', `/beta/invitations/${id}`, { action });
  }

  betaInvitationLink(id: string): Promise<{ token: string }> {
    return this.request('POST', `/beta/invitations/${id}`, { action: 'link' });
  }

  async serverInvites(review = false): Promise<ServerInviteRequest[]> {
    return (await this.get<{ invites: ServerInviteRequest[] }>(`/server-invites?review=${review}`)).invites;
  }

  requestServerInvite(server: Id, note: string, code?: string): Promise<ServerInviteRequest> {
    return this.request('POST', '/server-invites', { server, note, ...(code ? { code } : {}) });
  }

  reviewServerInvite(id: string, action: 'approve' | 'decline', code?: string): Promise<void> {
    return this.request('POST', `/server-invites/${id}`, { action, ...(code ? { code } : {}) });
  }

  platformUsers(): Promise<{ users: PlatformUser[]; updatedAt: number }> {
    return this.get('/admin/users');
  }

  accountAction(action: AccountAction, user: Id): Promise<{ id: string }> {
    return this.request('POST', '/admin/actions', { action, user });
  }

  accountActionResult(id: string): Promise<AccountActionResult> {
    return this.get(`/admin/actions/${id}`);
  }

  async wornTags(users: Id[]): Promise<Record<Id, ServerTag>> {
    if (!users.length) return {};
    return (await this.request<{ users: Record<Id, ServerTag> }>('POST', '/tags/lookup', { users })).users;
  }

  async serverTags(servers: Id[]): Promise<Record<Id, ServerTag>> {
    if (!servers.length) return {};
    return (await this.get<{ servers: Record<Id, ServerTag> }>(`/tags/servers?ids=${servers.join(',')}`)).servers;
  }

  setServerTag(server: Id, tag: string, emoji: Id): Promise<ServerTag> {
    return this.request('PUT', `/tags/servers/${server}`, { tag, emoji });
  }

  removeServerTag(server: Id): Promise<void> {
    return this.request('DELETE', `/tags/servers/${server}`);
  }

  async wearTag(server: Id | null): Promise<void> {
    await this.request('PUT', '/tags/me', { server });
  }
}
