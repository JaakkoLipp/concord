/**
 * The permissions the editors show, grouped as Stoat's own client groups them (m2c-plan.md). `channel` marks
 * the ones that mean something in a channel override; server-only ones are left out there.
 */
import { Permission } from '@concord/domain';

export type PermissionKey = keyof typeof Permission;
export interface PermissionGroup { id: 'server' | 'members' | 'channels' | 'messages' | 'voice' | 'mentions'; keys: PermissionKey[] }

export const GROUPS: PermissionGroup[] = [
  { id: 'server', keys: ['ManageServer', 'ManageChannel', 'ManageRole', 'ManagePermissions', 'ManageCustomisation'] },
  { id: 'members', keys: ['KickMembers', 'BanMembers', 'TimeoutMembers', 'AssignRoles', 'ChangeNickname', 'ManageNicknames', 'ChangeAvatar', 'RemoveAvatars'] },
  { id: 'channels', keys: ['ViewChannel', 'ReadMessageHistory', 'SendMessage', 'ManageMessages', 'InviteOthers'] },
  { id: 'messages', keys: ['SendEmbeds', 'UploadFiles', 'React', 'Masquerade', 'BypassSlowmode'] },
  { id: 'voice', keys: ['Connect', 'Speak', 'Video', 'Listen', 'MuteMembers', 'DeafenMembers', 'MoveMembers'] },
  { id: 'mentions', keys: ['MentionEveryone', 'MentionRoles'] },
];

/** Meaningless in a single channel: managing the server, its roles and members, and nicknames. */
const SERVER_ONLY = new Set<PermissionKey>([
  'ManageServer', 'ManageRole', 'ManageCustomisation', 'KickMembers', 'BanMembers', 'TimeoutMembers', 'AssignRoles',
  'ChangeNickname', 'ManageNicknames', 'ChangeAvatar', 'RemoveAvatars',
]);

export function groupsFor(context: 'server' | 'channel'): PermissionGroup[] {
  if (context === 'server') return GROUPS;
  return GROUPS.map((g) => ({ ...g, keys: g.keys.filter((k) => !SERVER_ONLY.has(k)) })).filter((g) => g.keys.length);
}

export type Tri = 'allow' | 'neutral' | 'deny';
export const triOf = (o: { allow: bigint; deny: bigint }, bit: bigint): Tri => ((o.allow & bit) ? 'allow' : (o.deny & bit) ? 'deny' : 'neutral');
export function setTri(o: { allow: bigint; deny: bigint }, bit: bigint, t: Tri): { allow: bigint; deny: bigint } {
  return { allow: t === 'allow' ? o.allow | bit : o.allow & ~bit, deny: t === 'deny' ? o.deny | bit : o.deny & ~bit };
}
