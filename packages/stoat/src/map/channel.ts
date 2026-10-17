import type { Channel } from '@concord/domain';
import { mapFile } from './file.ts';
import { big, clean, override, type WChannel, type WOverride } from './wire.ts';

export function mapChannel(c: WChannel): Channel {
  switch (c.channel_type) {
    case 'SavedMessages':
      return { kind: 'saved', id: c._id, user: c.user };
    case 'DirectMessage':
      return clean({ kind: 'dm', id: c._id, recipients: c.recipients, active: c.active, lastMessageId: c.last_message_id ?? undefined }) as Channel;
    case 'Group':
      return clean({
        kind: 'group', id: c._id, name: c.name, owner: c.owner, description: c.description ?? undefined, icon: mapFile(c.icon),
        recipients: c.recipients, lastMessageId: c.last_message_id ?? undefined,
        permissions: c.permissions === null || c.permissions === undefined ? undefined : big(c.permissions),
      }) as Channel;
    case 'TextChannel':
      return clean({
        kind: 'text', id: c._id, server: c.server, name: c.name, description: c.description ?? undefined, icon: mapFile(c.icon),
        lastMessageId: c.last_message_id ?? undefined,
        defaultPermissions: c.default_permissions ? override(c.default_permissions as WOverride) : undefined,
        rolePermissions: Object.fromEntries(Object.entries(c.role_permissions ?? {}).map(([id, o]) => [id, override(o as WOverride)])),
        voice: c.voice ? clean({ maxUsers: c.voice.max_users ?? undefined }) : undefined,
        nsfw: c.nsfw ?? false,
        slowmode: c.slowmode ?? undefined,
      }) as Channel;
  }
}

/** A ChannelUpdate payload. Fields are kept loose, because channel kinds share the event. */
export function mapChannelPatch(d: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (typeof d.name === 'string') out.name = d.name;
  if (typeof d.description === 'string') out.description = d.description;
  if (d.icon) out.icon = mapFile(d.icon as never);
  if (typeof d.last_message_id === 'string') out.lastMessageId = d.last_message_id;
  if (Array.isArray(d.recipients)) out.recipients = d.recipients;
  if (typeof d.active === 'boolean') out.active = d.active;
  if (typeof d.nsfw === 'boolean') out.nsfw = d.nsfw;
  if (typeof d.slowmode === 'number') out.slowmode = d.slowmode;
  if (typeof d.owner === 'string') out.owner = d.owner;
  if (d.default_permissions) out.defaultPermissions = override(d.default_permissions as WOverride);
  if (d.role_permissions) {
    out.rolePermissions = Object.fromEntries(Object.entries(d.role_permissions as Record<string, WOverride>).map(([id, o]) => [id, override(o)]));
  }
  if (typeof d.permissions === 'number') out.permissions = big(d.permissions);
  if (d.voice) out.voice = clean({ maxUsers: (d.voice as { max_users?: number }).max_users });
  return out;
}

export const CHANNEL_FIELDS: Record<string, string[]> = { Description: ['description'], Icon: ['icon'], DefaultPermissions: ['defaultPermissions'], Voice: ['voice'] };
