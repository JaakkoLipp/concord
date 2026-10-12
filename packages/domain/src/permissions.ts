/**
 * Port of Stoat's permission calculation (crates/core/permissions/src/impl.rs and
 * crates/core/database/src/util/permissions.rs at v0.15.5). Used to decide what the UI offers;
 * the server enforces the same rules.
 */
import type { Channel, Id, Member, Override, Relationship, Server, User } from './entities.ts';

const bit = (n: number) => 1n << BigInt(n);

export const Permission = {
  ManageChannel: bit(0), ManageServer: bit(1), ManagePermissions: bit(2), ManageRole: bit(3), ManageCustomisation: bit(4),
  KickMembers: bit(6), BanMembers: bit(7), TimeoutMembers: bit(8), AssignRoles: bit(9), ChangeNickname: bit(10),
  ManageNicknames: bit(11), ChangeAvatar: bit(12), RemoveAvatars: bit(13),
  ViewChannel: bit(20), ReadMessageHistory: bit(21), SendMessage: bit(22), ManageMessages: bit(23), ManageWebhooks: bit(24),
  InviteOthers: bit(25), SendEmbeds: bit(26), UploadFiles: bit(27), Masquerade: bit(28), React: bit(29),
  Connect: bit(30), Speak: bit(31), Video: bit(32), MuteMembers: bit(33), DeafenMembers: bit(34), MoveMembers: bit(35),
  Listen: bit(36), MentionEveryone: bit(37), MentionRoles: bit(38), BypassSlowmode: bit(39), ViewAuditLogs: bit(40),
} as const;

export const GRANT_ALL_SAFE = 0x000f_ffff_ffff_ffffn;
const ALL = 0xffff_ffff_ffff_ffffn;
const P = Permission;
export const VIEW_ONLY = P.ViewChannel | P.ReadMessageHistory;
const ALLOW_IN_TIMEOUT = VIEW_ONLY;
export const DEFAULT = VIEW_ONLY | P.SendMessage | P.InviteOthers | P.SendEmbeds | P.UploadFiles | P.Connect | P.Speak | P.Listen | P.Video;
export const DEFAULT_DIRECT_MESSAGE = DEFAULT | P.ManageChannel | P.React | P.Masquerade;

const UserPermission = { Access: 1n, ViewProfile: 2n, SendMessage: 4n, Invite: 8n } as const;

export const has = (value: bigint, permission: bigint) => (value & permission) === permission;
const apply = (value: bigint, o: Override) => (value | o.allow) & ~o.deny;

export interface PermissionContext {
  self: User;
  /** Relationship of `self` with other users, for DMs. */
  relationship?: (user: Id) => Relationship;
  /** Whether self shares a server or group with the user. */
  mutual?: (user: Id) => boolean;
  isBot?: (user: Id) => boolean;
  now?: Date;
}

function inTimeout(member: Member | undefined, now: Date): boolean {
  return !!member?.timeout && new Date(member.timeout) > now;
}

/** Role overrides sorted from the least to the most important, so the most important applies last. */
function roleOverrides(server: Server, member: Member | undefined, table: Record<Id, Override>): Override[] {
  const roles = member?.roles ?? [];
  return Object.entries(table)
    .filter(([id]) => roles.includes(id) && server.roles[id])
    .map(([id, o]) => [server.roles[id]!.rank, o] as const)
    .sort((a, b) => b[0] - a[0])
    .map(([, o]) => o);
}

function voiceAndTimeout(value: bigint, member: Member | undefined, now: Date): bigint {
  let v = value;
  if (member && !member.canPublish) v &= ~(P.Speak | P.Video);
  if (member && !member.canReceive) v &= ~P.Listen;
  if (inTimeout(member, now)) v &= ALLOW_IN_TIMEOUT;
  return v;
}

export function serverPermissions(server: Server, member: Member | undefined, ctx: PermissionContext): bigint {
  if (server.owner === ctx.self.id) return GRANT_ALL_SAFE;
  if (!member) return 0n;
  const serverRoles = Object.fromEntries(Object.values(server.roles).map((r) => [r.id, r.permissions]));
  let v = server.defaultPermissions;
  for (const o of roleOverrides(server, member, serverRoles)) v = apply(v, o);
  return voiceAndTimeout(v, member, ctx.now ?? new Date());
}

function userPermissions(other: Id, ctx: PermissionContext): bigint {
  if (other === ctx.self.id) return ALL;
  const rel = ctx.relationship?.(other) ?? 'None';
  if (rel === 'Friend') return ALL;
  if (rel === 'Blocked' || rel === 'BlockedOther') return UserPermission.Access;
  let v = rel === 'Incoming' || rel === 'Outgoing' ? UserPermission.Access : 0n;
  const mutual = ctx.mutual?.(other) ?? false;
  const otherIsBot = ctx.isBot?.(other) ?? false;
  if (mutual || otherIsBot) v = UserPermission.Access + UserPermission.ViewProfile;
  if (mutual && (!!ctx.self.bot || otherIsBot)) v += UserPermission.SendMessage;
  return v;
}

export function channelPermissions(
  channel: Channel,
  ctx: PermissionContext & { server?: Server; member?: Member },
): bigint {
  switch (channel.kind) {
    case 'saved':
      return channel.user === ctx.self.id ? GRANT_ALL_SAFE : 0n;
    case 'dm': {
      if (!channel.recipients.includes(ctx.self.id)) return 0n;
      const other = channel.recipients.find((r) => r !== ctx.self.id) ?? ctx.self.id;
      return has(userPermissions(other, ctx), UserPermission.SendMessage) ? DEFAULT_DIRECT_MESSAGE : VIEW_ONLY;
    }
    case 'group':
      if (channel.owner === ctx.self.id) return GRANT_ALL_SAFE;
      if (!channel.recipients.includes(ctx.self.id)) return 0n;
      return VIEW_ONLY | (channel.permissions ?? DEFAULT_DIRECT_MESSAGE);
    case 'text': {
      const { server, member } = ctx;
      if (!server) return 0n;
      if (server.owner === ctx.self.id) return GRANT_ALL_SAFE;
      if (!member) return 0n;
      const serverRoles = Object.fromEntries(Object.values(server.roles).map((r) => [r.id, r.permissions]));
      let v = server.defaultPermissions;
      if (channel.defaultPermissions) v = apply(v, channel.defaultPermissions);
      for (const o of roleOverrides(server, member, serverRoles)) v = apply(v, o);
      for (const o of roleOverrides(server, member, channel.rolePermissions)) v = apply(v, o);
      v = voiceAndTimeout(v, member, ctx.now ?? new Date());
      return has(v, P.ViewChannel) ? v : 0n;
    }
  }
}
