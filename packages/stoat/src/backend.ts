/** The Stoat implementation of the domain's Backend interface. */
import type { Backend, Capabilities, Gateway, GatewayHandlers, LoginResult, Message, MessagePage, MessageQuery, NodeInfo, OutgoingMessage, User } from '@concord/domain';
import type { components } from './api/types.ts';
import { capabilitiesFor } from './capabilities.ts';
import { mapChannel } from './map/channel.ts';
import { mapMember } from './map/member.ts';
import { mapMessage, mapUnread } from './map/message.ts';
import { mapProfile, mapUser } from './map/user.ts';
import type { WMember, WMessage, WUnread, WUser } from './map/wire.ts';
import { Rest } from './rest.ts';
import { StoatGateway } from './socket.ts';
import type { Transport } from './transport.ts';

type Root = components['schemas']['RevoltConfig'];
type WLogin = components['schemas']['ResponseLogin'];

const FRIENDLY_NAME = 'Concord';

export class StoatBackend implements Backend {
  capabilities: Capabilities = { serverSubscribe: false };
  private token: string | null = null;
  private readonly rest: Rest;
  private readonly transport: Transport;

  constructor(transport: Transport) {
    this.transport = transport;
    this.rest = new Rest(transport);
  }

  setToken(token: string | null): void {
    this.token = token;
    this.rest.setToken(token);
  }

  async root(): Promise<NodeInfo> {
    const r = await this.rest.request<Root>('GET', '/');
    this.capabilities = capabilitiesFor(r.revolt);
    const limits = r.features.limits as unknown as {
      global?: { restrict_server_creation?: string[]; message_replies?: number; message_reactions?: number };
      default?: { file_upload_size_limits?: Record<string, number>; message_length?: number; message_attachments?: number };
    };
    const livekit = (r.features as { livekit?: { enabled: boolean; nodes?: { name: string }[] } }).livekit;
    return {
      version: r.revolt,
      serverCreators: limits.global?.restrict_server_creation ?? [],
      uploadLimits: limits.default?.file_upload_size_limits ?? {},
      limits: {
        messageLength: limits.default?.message_length ?? 2000,
        attachments: limits.default?.message_attachments ?? 5,
        replies: limits.global?.message_replies ?? 5,
        reactions: limits.global?.message_reactions ?? 20,
      },
      voice: { enabled: livekit?.enabled ?? false, nodes: (livekit?.nodes ?? []).map((n) => ({ name: n.name })) },
      ...(r.vapid ? { vapid: r.vapid } : {}),
    };
  }

  private loginResult(r: WLogin): LoginResult {
    if (r.result === 'Success') return { kind: 'session', token: r.token, userId: r.user_id };
    if (r.result === 'MFA') return { kind: 'mfa', ticket: r.ticket, methods: r.allowed_methods };
    return { kind: 'disabled', userId: r.user_id };
  }

  async login(email: string, password: string): Promise<LoginResult> {
    return this.loginResult(await this.rest.request<WLogin>('POST', '/auth/session/login', { email, password, friendly_name: FRIENDLY_NAME }));
  }

  async loginMfa(ticket: string, response: { totp: string } | { recovery: string }): Promise<LoginResult> {
    const mfa_response = 'totp' in response ? { totp_code: response.totp } : { recovery_code: response.recovery };
    return this.loginResult(await this.rest.request<WLogin>('POST', '/auth/session/login', { mfa_ticket: ticket, mfa_response, friendly_name: FRIENDLY_NAME }));
  }

  async logout(): Promise<void> {
    if (this.token) await this.rest.request('POST', '/auth/session/logout').catch(() => {});
    this.setToken(null);
  }

  async onboarding(): Promise<boolean> {
    return (await this.rest.request<{ onboarding: boolean }>('GET', '/onboard/hello')).onboarding;
  }

  async completeOnboarding(username: string): Promise<User> {
    return mapUser(await this.rest.request<WUser>('POST', '/onboard/complete', { username }));
  }

  async self(): Promise<User> {
    return mapUser(await this.rest.request<WUser>('GET', '/users/@me'));
  }

  async messages(channel: string, q: MessageQuery): Promise<MessagePage> {
    const params = new URLSearchParams({ include_users: 'true', limit: String(q.limit ?? 50) });
    if (q.before) params.set('before', q.before);
    if (q.after) params.set('after', q.after);
    if (q.nearby) params.set('nearby', q.nearby);
    if (q.sort) params.set('sort', q.sort);
    const r = await this.rest.request<{ messages: WMessage[]; users: WUser[]; members?: WMember[] }>('GET', `/channels/${channel}/messages?${params}`);
    return { messages: r.messages.map(mapMessage), users: r.users.map(mapUser), members: (r.members ?? []).map(mapMember) };
  }

  async members(server: string) {
    const r = await this.rest.request<{ members: WMember[]; users: WUser[] }>('GET', `/servers/${server}/members`);
    return { members: r.members.map(mapMember), users: r.users.map(mapUser) };
  }

  async user(id: string) {
    return mapUser(await this.rest.request<WUser>('GET', `/users/${id}`));
  }

  async profile(id: string) {
    return mapProfile(await this.rest.request('GET', `/users/${id}/profile`));
  }

  async mutual(id: string) {
    const r = await this.rest.request<{ users: string[]; servers: string[]; channels?: string[] }>('GET', `/users/${id}/mutual`);
    return { users: r.users, servers: r.servers, channels: r.channels ?? [] };
  }

  async unreads() {
    return (await this.rest.request<WUnread[]>('GET', '/sync/unreads')).map(mapUnread);
  }

  async settings(keys: string[]) {
    const r = await this.rest.request<Record<string, [number, string]>>('POST', '/sync/settings/fetch', { keys });
    return Object.fromEntries(Object.entries(r).map(([k, [updated, value]]) => [k, { updated, value }]));
  }

  async sendMessage(channel: string, message: OutgoingMessage, key: string): Promise<Message> {
    const body = {
      content: message.content,
      // A reply to a message deleted meanwhile is sent without the reply rather than refused.
      ...(message.replies.length ? { replies: message.replies.map((r) => ({ ...r, fail_if_not_exists: false })) } : {}),
      ...(message.attachments.length ? { attachments: message.attachments } : {}),
    };
    // Stoat echoes the Idempotency-Key as the message's nonce (m2a-plan.md, checked live).
    return mapMessage(await this.rest.request<WMessage>('POST', `/channels/${channel}/messages`, body, { 'Idempotency-Key': key }));
  }

  async ack(channel: string, message: string): Promise<void> {
    await this.rest.request('PUT', `/channels/${channel}/ack/${message}`);
  }

  async editMessage(channel: string, message: string, content: string): Promise<Message> {
    return mapMessage(await this.rest.request<WMessage>('PATCH', `/channels/${channel}/messages/${message}`, { content }));
  }

  async deleteMessage(channel: string, message: string): Promise<void> {
    await this.rest.request('DELETE', `/channels/${channel}/messages/${message}`);
  }

  async pinMessage(channel: string, message: string, pinned: boolean): Promise<void> {
    await this.rest.request(pinned ? 'POST' : 'DELETE', `/channels/${channel}/messages/${message}/pin`);
  }

  async dms() {
    return (await this.rest.request<components['schemas']['Channel'][]>('GET', '/users/dms')).map(mapChannel);
  }

  connect(handlers: GatewayHandlers): Gateway {
    if (!this.token) throw new Error('connect() needs a session');
    return new StoatGateway(this.transport, this.token, handlers, this.capabilities);
  }
}
