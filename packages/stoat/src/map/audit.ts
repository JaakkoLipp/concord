/** Stoat's audit log entries, as the domain shows them (m4.7-plan.md task 8). */
import type { AuditAction, AuditEntry, MemberChange } from '@concord/domain';
import type { components } from '../api/types.ts';
import { decodeReason } from '../reason.ts';
import { clean } from './wire.ts';

type S = components['schemas'];
export type WAuditEntry = S['AuditLogEntry'];
type WPartialMember = S['PartialMember'];

/** The fields set in either side of an edit, as Stoat names them. */
const changed = (before: object, after: object) => [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => k !== 'id');

/**
 * What a member edit changed. Stoat records only the fields it touched, so a removal shows as a field present before and
 * absent after, and a timeout's end as an edit with nothing at all (m4.7-results.md task 1).
 */
export function memberChanges(before: WPartialMember, after: WPartialMember): MemberChange[] {
  const out: MemberChange[] = [];
  if ('nickname' in after || 'nickname' in before) out.push(clean({ kind: 'nickname', to: after.nickname ?? undefined }) as MemberChange);
  if ('avatar' in after || 'avatar' in before) out.push({ kind: 'avatar', removed: !after.avatar });
  if ('roles' in after || 'roles' in before) {
    const was = before.roles ?? [];
    const now = after.roles ?? [];
    out.push({ kind: 'roles', added: now.filter((r) => !was.includes(r)), removed: was.filter((r) => !now.includes(r)) });
  }
  if (after.timeout) out.push({ kind: 'timeout', until: after.timeout });
  if (typeof after.can_publish === 'boolean') out.push({ kind: 'mute', on: !after.can_publish });
  if (typeof after.can_receive === 'boolean') out.push({ kind: 'deafen', on: !after.can_receive });
  return out;
}

function mapAction(a: S['AuditLogEntryAction']): AuditAction {
  switch (a.type) {
    case 'MessageDelete': return { type: a.type, author: a.author, channel: a.channel };
    case 'MessageBulkDelete': return { type: a.type, channel: a.channel, count: a.count };
    case 'MessagePin': case 'MessageUnpin': return { type: a.type, author: a.author, channel: a.channel };
    case 'BanCreate': case 'BanDelete': case 'MemberKick': return { type: a.type, user: a.user };
    case 'MemberEdit': return { type: a.type, user: a.user, changes: memberChanges(a.before ?? {}, a.after ?? {}) };
    case 'ChannelCreate': case 'ChannelDelete': return { type: a.type, channel: a.channel, name: a.name };
    case 'ChannelEdit': return { type: a.type, channel: a.channel, changed: changed(a.before ?? {}, a.after ?? {}) };
    case 'ChannelRolePermissionsEdit': return { type: a.type, channel: a.channel, role: a.role };
    case 'ServerEdit': return { type: a.type, changed: changed(a.before ?? {}, a.after ?? {}) };
    case 'RoleCreate': case 'RoleDelete': return { type: a.type, role: a.role, name: a.name };
    case 'RoleEdit': return { type: a.type, role: a.role, changed: changed(a.before ?? {}, a.after ?? {}) };
    case 'RolesReorder': return { type: a.type };
    case 'InviteCreate': case 'InviteDelete': return { type: a.type, invite: a.invite, channel: a.channel };
    case 'WebhookCreate': case 'WebhookDelete': return { type: a.type, name: a.name, channel: a.channel };
    case 'EmojiCreate': case 'EmojiDelete': return { type: a.type, name: a.name };
    case 'EmojiUpdate': return { type: a.type, name: a.after?.name ?? a.before?.name ?? '' };
    default: return { type: 'Unknown', name: (a as { type?: string }).type ?? '' };
  }
}

export function mapAuditEntry(e: WAuditEntry): AuditEntry {
  return clean({ id: e._id, user: e.user, target: e.target ?? undefined, reason: e.reason ? decodeReason(e.reason) : undefined, action: mapAction(e.action) }) as AuditEntry;
}
