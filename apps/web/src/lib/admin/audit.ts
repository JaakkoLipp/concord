/** The audit log in words (m4.7-plan.md task 8): what each entry says after the name of whoever acted. */
import type { AuditEntry, Id, MemberChange, Store, User } from '@concord/domain';
import { m } from '$lib/i18n/index.ts';
import { shortDate } from '$lib/markdown/time.ts';

/** The action filter's groups, as Stoat's `type` values. */
export const AUDIT_GROUPS = {
  messages: ['MessageDelete', 'MessageBulkDelete', 'MessagePin', 'MessageUnpin'],
  members: ['MemberEdit', 'MemberKick'],
  bans: ['BanCreate', 'BanDelete'],
  channels: ['ChannelCreate', 'ChannelEdit', 'ChannelDelete', 'ChannelRolePermissionsEdit'],
  roles: ['RoleCreate', 'RoleEdit', 'RoleDelete', 'RolesReorder'],
  server: ['ServerEdit'],
  invites: ['InviteCreate', 'InviteDelete'],
  emoji: ['EmojiCreate', 'EmojiUpdate', 'EmojiDelete'],
  webhooks: ['WebhookCreate', 'WebhookDelete'],
} as const;
export type AuditGroup = keyof typeof AUDIT_GROUPS;

/** Names for the log: the server's own, then what the log's page brought for people who have left. */
export interface AuditNames { user(id: Id): string; channel(id: Id): string; role(id: Id): string }

export function auditNames(store: Store, server: Id, users: ReadonlyMap<Id, User>): AuditNames {
  return {
    user: (id) => (store.users.has(id) ? store.displayName(id, server) : (users.get(id)?.displayName ?? users.get(id)?.username ?? m.admin.audit.someone)),
    channel: (id) => { const c = store.channels.get(id); return c?.kind === 'text' ? c.name : m.admin.audit.gone; },
    role: (id) => store.servers.get(server)?.roles[id]?.name ?? m.admin.audit.goneRole,
  };
}

function change(c: MemberChange, user: string, n: AuditNames): string {
  const a = m.admin.audit;
  switch (c.kind) {
    case 'nickname': return c.to ? a.nickname(user, c.to) : a.nicknameRemoved(user);
    case 'avatar': return c.removed ? a.avatarRemoved(user) : a.avatarSet(user);
    case 'roles': return [
      c.added.length ? a.rolesAdded(user, c.added.map(n.role).join(', ')) : '',
      c.removed.length ? a.rolesRemoved(user, c.removed.map(n.role).join(', ')) : '',
    ].filter(Boolean).join('; ') || a.edited(user);
    case 'timeout': return a.timedOut(user, shortDate(new Date(c.until)));
    case 'mute': return a.muted(user, c.on);
    case 'deafen': return a.deafened(user, c.on);
  }
}

/** What an entry says, after whoever acted. An edit Stoat recorded nothing of, such as a timeout's end, is "edited them". */
export function describe(e: AuditEntry, n: AuditNames): string {
  const a = m.admin.audit;
  const x = e.action;
  switch (x.type) {
    case 'MessageDelete': return a.messageDelete(n.user(x.author), n.channel(x.channel));
    case 'MessageBulkDelete': return a.bulkDelete(x.count, n.channel(x.channel));
    case 'MessagePin': return a.pin(n.user(x.author), n.channel(x.channel));
    case 'MessageUnpin': return a.unpin(n.user(x.author), n.channel(x.channel));
    case 'BanCreate': return a.ban(n.user(x.user));
    case 'BanDelete': return a.unban(n.user(x.user));
    case 'MemberKick': return a.kick(n.user(x.user));
    case 'MemberEdit': {
      const user = n.user(x.user);
      return x.changes.length ? x.changes.map((c) => change(c, user, n)).join('; ') : a.edited(user);
    }
    case 'ChannelCreate': return a.channelCreate(x.name);
    case 'ChannelDelete': return a.channelDelete(x.name);
    case 'ChannelEdit': return a.channelEdit(n.channel(x.channel));
    case 'ChannelRolePermissionsEdit': return a.channelPermissions(n.role(x.role), n.channel(x.channel));
    case 'ServerEdit': return a.serverEdit;
    case 'RoleCreate': return a.roleCreate(x.name);
    case 'RoleDelete': return a.roleDelete(x.name);
    case 'RoleEdit': return a.roleEdit(n.role(x.role));
    case 'RolesReorder': return a.rolesReorder;
    case 'InviteCreate': return a.inviteCreate(n.channel(x.channel));
    case 'InviteDelete': return a.inviteDelete(x.invite);
    case 'WebhookCreate': return a.webhookCreate(x.name, n.channel(x.channel));
    case 'WebhookDelete': return a.webhookDelete(x.name, n.channel(x.channel));
    case 'EmojiCreate': return a.emojiCreate(x.name);
    case 'EmojiUpdate': return a.emojiUpdate(x.name);
    case 'EmojiDelete': return a.emojiDelete(x.name);
    case 'Unknown': return a.unknown(x.name);
  }
}

/** The log's pages: 50 at a time, and at most one a second, since every request spends the server's shared 5 per 10 s. */
export const AUDIT_PAGE = 50;
export const AUDIT_GAP_MS = 1_000;
