/**
 * The permissions the editors show, grouped as Stoat's own client groups them (m2c-plan.md). A channel's overrides
 * list only what means something there: no server-only ones, and no voice ones in a text channel (m4.7-plan.md task 5).
 */
import { Permission } from '@concord/domain';

export type PermissionKey = keyof typeof Permission;
export interface PermissionGroup { id: 'server' | 'members' | 'channels' | 'messages' | 'voice' | 'mentions'; keys: PermissionKey[] }

export const GROUPS: PermissionGroup[] = [
  { id: 'server', keys: ['ManageServer', 'ManageChannel', 'ManageRole', 'ManagePermissions', 'ManageCustomisation', 'ViewAuditLogs'] },
  { id: 'members', keys: ['KickMembers', 'BanMembers', 'TimeoutMembers', 'AssignRoles', 'ChangeNickname', 'ManageNicknames', 'ChangeAvatar', 'RemoveAvatars'] },
  { id: 'channels', keys: ['ViewChannel', 'ReadMessageHistory', 'SendMessage', 'ManageMessages', 'InviteOthers'] },
  { id: 'messages', keys: ['SendEmbeds', 'UploadFiles', 'React', 'Masquerade', 'BypassSlowmode'] },
  { id: 'voice', keys: ['Connect', 'Speak', 'Video', 'Listen', 'MuteMembers', 'DeafenMembers', 'MoveMembers'] },
  { id: 'mentions', keys: ['MentionEveryone', 'MentionRoles'] },
];

/** Meaningless in a single channel: managing the server, its roles and members, and nicknames. */
const SERVER_ONLY = new Set<PermissionKey>([
  'ManageServer', 'ManageRole', 'ManageCustomisation', 'KickMembers', 'BanMembers', 'TimeoutMembers', 'AssignRoles',
  'ChangeNickname', 'ManageNicknames', 'ChangeAvatar', 'RemoveAvatars', 'ViewAuditLogs',
]);

/** Where the list is shown: a role's server-wide permissions, or a text or voice channel's overrides. A voice channel has a chat too. */
export type PermissionContext = 'server' | 'text' | 'voice';

export function groupsFor(context: PermissionContext): PermissionGroup[] {
  if (context === 'server') return GROUPS;
  return GROUPS.map((g) => ({ ...g, keys: g.keys.filter((k) => !SERVER_ONLY.has(k)) }))
    .filter((g) => g.keys.length && (context === 'voice' || g.id !== 'voice'));
}

/**
 * Permissions that can wipe history or take a server over (m4.7-plan.md task 11). Marked in the editor, granted only after
 * a confirmation naming how many members get them, and never given to Everyone in Concord's editor.
 */
export const DANGEROUS: PermissionKey[] = ['ManageChannel', 'ManageMessages', 'BanMembers', 'ManageServer', 'ManageRole', 'ManagePermissions'];
export const DANGEROUS_BITS = DANGEROUS.reduce((bits, k) => bits | Permission[k], 0n);
export const isDangerous = (k: PermissionKey) => DANGEROUS.includes(k);

/** The dangerous permissions a change newly allows. */
export function newlyDangerous(before: bigint, after: bigint): PermissionKey[] {
  return DANGEROUS.filter((k) => (after & Permission[k]) !== 0n && (before & Permission[k]) === 0n);
}

/**
 * Suggested roles for a new server (m4.7-plan.md task 11), as starting points. A Moderator keeps the chat tidy but can't
 * delete channels or ban; an Admin has everything. Manage server also lets someone add bots, which Stoat can't separate.
 */
export const SUGGESTED_ROLES = {
  admin: Object.values(Permission).reduce((bits, b) => bits | b, 0n) & ~Permission.ManageWebhooks,
  moderator: Permission.KickMembers | Permission.TimeoutMembers | Permission.MuteMembers | Permission.DeafenMembers | Permission.MoveMembers
    | Permission.ManageMessages | Permission.ManageNicknames | Permission.ViewAuditLogs,
} as const;

export type Tri = 'allow' | 'neutral' | 'deny';
export const triOf = (o: { allow: bigint; deny: bigint }, bit: bigint): Tri => ((o.allow & bit) ? 'allow' : (o.deny & bit) ? 'deny' : 'neutral');
export function setTri(o: { allow: bigint; deny: bigint }, bit: bigint, t: Tri): { allow: bigint; deny: bigint } {
  return { allow: t === 'allow' ? o.allow | bit : o.allow & ~bit, deny: t === 'deny' ? o.deny | bit : o.deny & ~bit };
}
