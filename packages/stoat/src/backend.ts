/** The Stoat implementation of the domain's Backend interface. */
import type {
  Backend, Capabilities, Channel, ChannelEdit, Emoji, Gateway, GatewayHandlers, GroupEdit, Id, Invite, InvitePreview, LoginResult, Member, SelfEdit, SelfField, Message,
  MessagePage, MessageQuery, NodeInfo, OutgoingMessage, Override, Role, RoleEdit, SearchQuery, Server, ServerEdit, User,
} from '@concord/domain';
import { JoinCallError, type JoinFailure } from '@concord/domain/errors';
import type { components } from './api/types.ts';
import { capabilitiesFor } from './capabilities.ts';
import { mapChannel } from './map/channel.ts';
import { mapEmoji } from './map/emoji.ts';
import { mapFile } from './map/file.ts';
import { mapRole, mapServer, wireSystemChannels } from './map/server.ts';
import { mapMember } from './map/member.ts';
import { mapMessage, mapUnread } from './map/message.ts';
import { mapProfile, mapUser } from './map/user.ts';
import type { WChannel, WEmoji, WMember, WMessage, WRole, WServer, WUnread, WUser } from './map/wire.ts';
import { Rest, StoatError } from './rest.ts';
import { StoatGateway } from './socket.ts';
import type { Transport } from './transport.ts';

type Root = components['schemas']['RevoltConfig'];
type WLogin = components['schemas']['ResponseLogin'];

const FRIENDLY_NAME = 'Concord';

type WInvite = { type: string; _id: string; server: string; channel: string; creator: string };
type WInvitePreview = components['schemas']['InviteResponse'];
type WInviteJoin = { type: 'Server'; server: { _id: string }; channels: { _id: string }[] } | { type: 'Group'; channel: { _id: string } };
const mapInvite = (i: WInvite): Invite => ({ code: i._id, server: i.server, channel: i.channel, creator: i.creator });

/** `join_call`'s refusals in 0.15.5 (delta/src/routes/channels/voice_join.rs). */
export function joinFailureOf(e: StoatError): JoinFailure {
  switch (e.kind) {
    case 'MissingPermission': return 'no-permission';
    case 'CannotJoinCall': return 'full';
    case 'NotAVoiceChannel': return 'not-voice';
    case 'AlreadyConnected': return 'already-connected';
    // No voice node configured, or an unknown one.
    case 'LiveKitUnavailable': case 'UnknownNode': return 'unavailable';
    case 'NotFound': return 'not-found';
    case 'SignedOut': return 'signed-out';
  }
  if (e.status === 401) return 'signed-out';
  if (e.status === 404) return 'not-found';
  if (e.status === 429) return 'rate-limited';
  // A LiveKit API failure behind Stoat.
  if (e.status >= 500) return 'unavailable';
  return 'unknown';
}

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
      global?: { restrict_server_creation?: string[]; message_replies?: number; message_reactions?: number; group_size?: number; new_user_hours?: number; server_emoji?: number; server_roles?: number; server_channels?: number };
      new_user?: { outgoing_friend_requests?: number };
      default?: { file_upload_size_limits?: Record<string, number>; message_length?: number; message_attachments?: number; outgoing_friend_requests?: number };
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
      serverLimits: { emoji: limits.global?.server_emoji ?? 100, roles: limits.global?.server_roles ?? 200, channels: limits.global?.server_channels ?? 200 },
      voice: { enabled: livekit?.enabled ?? false, nodes: (livekit?.nodes ?? []).map((n) => ({ name: n.name })) },
      social: {
        friendRequests: {
          newUser: limits.new_user?.outgoing_friend_requests ?? 5,
          other: limits.default?.outgoing_friend_requests ?? 10,
          newUserHours: limits.global?.new_user_hours ?? 72,
        },
        groupSize: limits.global?.group_size ?? 100,
      },
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

  async react(channel: string, message: string, emoji: string, add: boolean): Promise<void> {
    await this.rest.request(add ? 'PUT' : 'DELETE', `/channels/${channel}/messages/${message}/reactions/${encodeURIComponent(emoji)}`);
  }

  private reactionForms: Promise<(emoji: string) => string | null> | null = null;

  reactionEmoji(): Promise<(emoji: string) => string | null> {
    this.reactionForms ??= this.loadReactionForms();
    return this.reactionForms;
  }

  private async loadReactionForms(): Promise<(emoji: string) => string | null> {
    // Stoat's own list (crates/core/database/src/models/emojis/unicode_emoji.txt at v0.15.5), matched as
    // Stoat matches it, without U+FE0F on either side. Its own spelling is the one we send.
    const text = (await import('../data/unicode_emoji-0.15.5.txt?raw')).default;
    const strip = (s: string) => s.replaceAll('\uFE0F', '').trim();
    const forms = new Map<string, string>();
    for (const line of text.split('\n')) if (line.trim()) forms.set(strip(line), line.trim());
    return (emoji) => (/^[0-9A-HJKMNP-TV-Z]{26}$/.test(emoji) ? emoji : forms.get(strip(emoji)) ?? null);
  }

  async setSettings(values: Record<string, string>): Promise<void> {
    // The timestamp lets other clients order writes; the last write wins.
    await this.rest.request('POST', `/sync/settings/set?timestamp=${Date.now()}`, values);
  }

  async addFriend(tag: string): Promise<User> {
    return mapUser(await this.rest.request<WUser>('POST', '/users/friend', { username: tag }));
  }

  async acceptFriend(user: string): Promise<User> {
    return mapUser(await this.rest.request<WUser>('PUT', `/users/${user}/friend`));
  }

  async removeFriend(user: string): Promise<User> {
    return mapUser(await this.rest.request<WUser>('DELETE', `/users/${user}/friend`));
  }

  async block(user: string): Promise<User> {
    return mapUser(await this.rest.request<WUser>('PUT', `/users/${user}/block`));
  }

  async unblock(user: string): Promise<User> {
    return mapUser(await this.rest.request<WUser>('DELETE', `/users/${user}/block`));
  }

  async openDm(user: string): Promise<Channel> {
    return mapChannel(await this.rest.request<WChannel>('GET', `/users/${user}/dm`));
  }

  async createGroup(name: string, users: string[]): Promise<Channel> {
    return mapChannel(await this.rest.request<WChannel>('POST', '/channels/create', { name, users }));
  }

  async addGroupMember(group: string, user: string): Promise<void> {
    await this.rest.request('PUT', `/channels/${group}/recipients/${user}`);
  }

  async removeGroupMember(group: string, user: string): Promise<void> {
    await this.rest.request('DELETE', `/channels/${group}/recipients/${user}`);
  }

  async leaveGroup(group: string, silent = false): Promise<void> {
    await this.rest.request('DELETE', `/channels/${group}${silent ? '?leave_silently=true' : ''}`);
  }

  async editGroup(group: string, change: GroupEdit): Promise<Channel> {
    const remove = (change.remove ?? []).map((f) => (f === 'icon' ? 'Icon' : 'Description'));
    const body = {
      ...(change.name !== undefined ? { name: change.name } : {}),
      ...(change.description !== undefined ? { description: change.description } : {}),
      ...(change.icon !== undefined ? { icon: change.icon } : {}),
      ...(change.owner !== undefined ? { owner: change.owner } : {}),
      ...(remove.length ? { remove } : {}),
    };
    return mapChannel(await this.rest.request<WChannel>('PATCH', `/channels/${group}`, body));
  }

  async editSelf(change: SelfEdit): Promise<User> {
    const fields: Record<SelfField, string> = {
      displayName: 'DisplayName', pronouns: 'Pronouns', avatar: 'Avatar', statusText: 'StatusText', presence: 'StatusPresence',
      bio: 'ProfileContent', banner: 'ProfileBackground',
    };
    const status = { ...(change.presence !== undefined ? { presence: change.presence } : {}), ...(change.statusText !== undefined ? { text: change.statusText } : {}) };
    const profile = { ...(change.bio !== undefined ? { content: change.bio } : {}), ...(change.banner !== undefined ? { background: change.banner } : {}) };
    const body = {
      ...(change.displayName !== undefined ? { display_name: change.displayName } : {}),
      ...(change.pronouns !== undefined ? { pronouns: change.pronouns } : {}),
      ...(change.avatar !== undefined ? { avatar: change.avatar } : {}),
      ...(Object.keys(status).length ? { status } : {}),
      ...(Object.keys(profile).length ? { profile } : {}),
      ...(change.remove?.length ? { remove: change.remove.map((f) => fields[f]) } : {}),
    };
    return mapUser(await this.rest.request<WUser>('PATCH', '/users/@me', body));
  }

  async search(channel: string, q: SearchQuery): Promise<MessagePage> {
    // Stoat refuses `pinned` together with `query`, so a pins search sends only `pinned`.
    const body = { ...(q.pinned ? { pinned: true } : { query: q.query }), limit: q.limit, sort: q.sort, include_users: true, ...(q.before ? { before: q.before } : {}) };
    const r = await this.rest.request<{ messages: WMessage[]; users: WUser[]; members?: WMember[] }>('POST', `/channels/${channel}/search`, body);
    return { messages: r.messages.map(mapMessage), users: r.users.map(mapUser), members: (r.members ?? []).map(mapMember) };
  }

  async upload(file: Blob, name: string, onProgress?: (fraction: number) => void, tag = 'attachments'): Promise<string> {
    if (!this.transport.upload) throw new Error('this transport cannot upload');
    const form = new FormData();
    form.append('file', file, name);
    const res = await this.transport.upload(`/${tag}`, form, this.token ? { 'x-session-token': this.token } : {}, onProgress);
    if (res.status >= 400) throw new StoatError(res.status, res.body, `POST /autumn/${tag}`);
    return (res.body as { id: string }).id;
  }

  // ---------- server administration (m2c-plan.md) ----------

  async createServer(name: string): Promise<{ server: Server; channels: Channel[] }> {
    const r = await this.rest.request<{ server: WServer; channels: WChannel[] }>('POST', '/servers/create', { name });
    return { server: mapServer(r.server), channels: r.channels.map(mapChannel) };
  }

  async editServer(server: string, change: ServerEdit): Promise<void> {
    const names = { description: 'Description', icon: 'Icon', banner: 'Banner', systemMessages: 'SystemMessages' } as const;
    const body = {
      ...(change.name !== undefined ? { name: change.name } : {}),
      ...(change.description !== undefined ? { description: change.description } : {}),
      ...(change.icon !== undefined ? { icon: change.icon } : {}),
      ...(change.banner !== undefined ? { banner: change.banner } : {}),
      ...(change.categories ? { categories: change.categories.map((c) => ({ id: c.id, title: c.title, channels: c.channels })) } : {}),
      ...(change.systemMessages ? { system_messages: wireSystemChannels(change.systemMessages) } : {}),
      ...(change.remove?.length ? { remove: change.remove.map((f) => names[f]) } : {}),
    };
    await this.rest.request('PATCH', `/servers/${server}`, body);
  }

  async deleteServer(server: string): Promise<void> {
    await this.rest.request('DELETE', `/servers/${server}`);
  }

  async leaveServer(server: string, silent = false): Promise<void> {
    await this.rest.request('DELETE', `/servers/${server}${silent ? '?leave_silently=true' : ''}`);
  }

  async channel(channel: string): Promise<Channel> {
    return mapChannel(await this.rest.request<WChannel>('GET', `/channels/${channel}`));
  }

  async server(server: string): Promise<Server> {
    return mapServer(await this.rest.request<WServer>('GET', `/servers/${server}`));
  }

  async member(server: string, user: string): Promise<Member> {
    return mapMember(await this.rest.request<WMember>('GET', `/servers/${server}/members/${user}`));
  }

  async setDefaultPermissions(server: string, permissions: bigint): Promise<void> {
    await this.rest.request('PUT', `/servers/${server}/permissions/default`, { permissions: Number(permissions) });
  }

  async createRole(server: string, name: string): Promise<Role> {
    const r = await this.rest.request<{ id: string; role: WRole }>('POST', `/servers/${server}/roles`, { name });
    return mapRole(r.id, r.role);
  }

  async editRole(server: string, role: string, change: RoleEdit): Promise<void> {
    const body = {
      ...(change.name !== undefined ? { name: change.name } : {}),
      ...(change.colour !== undefined ? { colour: change.colour } : {}),
      ...(change.hoist !== undefined ? { hoist: change.hoist } : {}),
      ...(change.remove?.length ? { remove: change.remove.map(() => 'Colour') } : {}),
    };
    await this.rest.request('PATCH', `/servers/${server}/roles/${role}`, body);
  }

  async setRolePermissions(server: string, role: string, p: Override): Promise<void> {
    await this.rest.request('PUT', `/servers/${server}/permissions/${role}`, { permissions: { allow: Number(p.allow), deny: Number(p.deny) } });
  }

  async deleteRole(server: string, role: string): Promise<void> {
    await this.rest.request('DELETE', `/servers/${server}/roles/${role}`);
  }

  async setRoleRanks(server: string, order: string[]): Promise<void> {
    await this.rest.request('PATCH', `/servers/${server}/roles/ranks`, { ranks: order });
  }

  async createChannel(server: string, kind: 'text' | 'voice', name: string, description?: string): Promise<Channel> {
    const body = { type: kind === 'voice' ? 'Voice' : 'Text', name, ...(description ? { description } : {}) };
    return mapChannel(await this.rest.request<WChannel>('POST', `/servers/${server}/channels`, body));
  }

  async editChannel(channel: string, change: ChannelEdit): Promise<void> {
    const body = {
      ...(change.name !== undefined ? { name: change.name } : {}),
      ...(change.description !== undefined ? { description: change.description } : {}),
      ...(change.remove?.length ? { remove: change.remove.map(() => 'Description') } : {}),
    };
    await this.rest.request('PATCH', `/channels/${channel}`, body);
  }

  async deleteChannel(channel: string): Promise<void> {
    await this.rest.request('DELETE', `/channels/${channel}`);
  }

  async setChannelPermissions(channel: string, role: string, p: Override): Promise<void> {
    await this.rest.request('PUT', `/channels/${channel}/permissions/${role}`, { permissions: { allow: Number(p.allow), deny: Number(p.deny) } });
  }

  async createInvite(channel: string): Promise<Invite> {
    return mapInvite(await this.rest.request<WInvite>('POST', `/channels/${channel}/invites`));
  }

  async setPasswordWithToken(token: string, password: string): Promise<void> {
    // remove_sessions: a link is also how a lost password is reset, so any old session should end.
    await this.rest.request('PATCH', '/auth/account/reset_password', { token, password, remove_sessions: true });
  }

  async invite(code: string): Promise<InvitePreview> {
    const i = await this.rest.request<WInvitePreview>('GET', `/invites/${encodeURIComponent(code)}`);
    if (i.type === 'Server') {
      return {
        kind: 'server', code: i.code, server: i.server_id, name: i.server_name, ...(i.server_icon ? { icon: mapFile(i.server_icon) } : {}),
        channel: i.channel_id, channelName: i.channel_name, inviter: i.user_name, members: i.member_count,
      };
    }
    return { kind: 'group', code: i.code, channel: i.channel_id, name: i.channel_name, inviter: i.user_name };
  }

  async joinInvite(code: string): Promise<{ server?: Id; channel: Id }> {
    const r = await this.rest.request<WInviteJoin>('POST', `/invites/${encodeURIComponent(code)}`);
    if (r.type === 'Server') return { server: r.server._id, channel: r.channels[0]?._id ?? '' };
    return { channel: r.channel._id };
  }

  async invites(server: string): Promise<Invite[]> {
    return (await this.rest.request<WInvite[]>('GET', `/servers/${server}/invites`)).filter((i) => i.type === 'Server').map(mapInvite);
  }

  async deleteInvite(code: string): Promise<void> {
    await this.rest.request('DELETE', `/invites/${code}`);
  }

  async setMemberRoles(server: string, user: string, roles: string[]): Promise<void> {
    await this.rest.request('PATCH', `/servers/${server}/members/${user}`, roles.length ? { roles } : { remove: ['Roles'] });
  }

  async kick(server: string, user: string): Promise<void> {
    await this.rest.request('DELETE', `/servers/${server}/members/${user}`);
  }

  async ban(server: string, user: string, reason?: string): Promise<void> {
    await this.rest.request('PUT', `/servers/${server}/bans/${user}`, reason ? { reason } : {});
  }

  async unban(server: string, user: string): Promise<void> {
    await this.rest.request('DELETE', `/servers/${server}/bans/${user}`);
  }

  async bans(server: string) {
    type WBans = { users: Pick<WUser, '_id' | 'username' | 'discriminator' | 'avatar'>[]; bans: { _id: { user: string }; reason?: string | null }[] };
    const r = await this.rest.request<WBans>('GET', `/servers/${server}/bans`);
    return {
      bans: r.bans.map((b) => ({ user: b._id.user, ...(b.reason ? { reason: b.reason } : {}) })),
      // Only what the ban list carries: anything else about these users is unknown, not empty.
      users: r.users.map((u) => mapUser({ ...u, relationship: 'None', online: false } as WUser)),
    };
  }

  async createEmoji(file: string, server: string, name: string): Promise<Emoji> {
    return mapEmoji(await this.rest.request<WEmoji>('PUT', `/custom/emoji/${file}`, { name, parent: { type: 'Server', id: server } }));
  }

  async renameEmoji(emoji: string, name: string): Promise<void> {
    await this.rest.request('PATCH', `/custom/emoji/${emoji}`, { name });
  }

  async deleteEmoji(emoji: string): Promise<void> {
    await this.rest.request('DELETE', `/custom/emoji/${emoji}`);
  }

  // ---------- voice (m4-plan.md task 4) ----------

  async joinCall(channel: string, node: string): Promise<{ token: string }> {
    // Stoat's answer also names a LiveKit URL, which the client never uses: it connects to its own origin.
    try {
      const r = await this.rest.request<{ token: string }>('POST', `/channels/${channel}/join_call`, { node, force_disconnect: true });
      return { token: r.token };
    } catch (e) {
      if (e instanceof StoatError) throw new JoinCallError(e.status, e.kind, e.message, joinFailureOf(e));
      throw e;
    }
  }

  async dms() {
    return (await this.rest.request<components['schemas']['Channel'][]>('GET', '/users/dms')).map(mapChannel);
  }

  connect(handlers: GatewayHandlers): Gateway {
    if (!this.token) throw new Error('connect() needs a session');
    return new StoatGateway(this.transport, this.token, handlers, this.capabilities);
  }
}
