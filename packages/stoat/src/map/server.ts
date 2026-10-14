import type { Role, Server, SystemChannels } from '@concord/domain';
import { mapFile } from './file.ts';
import { big, clean, override, type WRole, type WServer } from './wire.ts';

export function mapRole(id: string, r: WRole): Role {
  return clean({ id, name: r.name, colour: r.colour ?? undefined, hoist: r.hoist ?? false, rank: r.rank ?? 0, permissions: override(r.permissions) }) as Role;
}

type WSystem = NonNullable<WServer['system_messages']>;

export function mapSystemChannels(m: WSystem | null | undefined): SystemChannels | undefined {
  if (!m) return undefined;
  return clean({ joined: m.user_joined ?? undefined, left: m.user_left ?? undefined, kicked: m.user_kicked ?? undefined, banned: m.user_banned ?? undefined }) as SystemChannels;
}

export function wireSystemChannels(m: SystemChannels): WSystem {
  return clean({ user_joined: m.joined, user_left: m.left, user_kicked: m.kicked, user_banned: m.banned }) as WSystem;
}

export function mapServer(s: WServer): Server {
  return clean({
    id: s._id,
    owner: s.owner,
    name: s.name,
    description: s.description ?? undefined,
    icon: mapFile(s.icon),
    banner: mapFile(s.banner),
    channels: s.channels,
    categories: (s.categories ?? []).map((c) => ({ id: c.id, title: c.title, channels: c.channels })),
    roles: Object.fromEntries(Object.entries(s.roles ?? {}).map(([id, r]) => [id, mapRole(id, r)])),
    defaultPermissions: big(s.default_permissions),
    memberCount: (s as { approximate_member_count?: number }).approximate_member_count,
    systemMessages: mapSystemChannels(s.system_messages),
  }) as Server;
}

export function mapServerPatch(d: Partial<WServer>): Partial<Server> {
  const out: Partial<Server> = {};
  if (d.name !== undefined) out.name = d.name;
  if (d.owner !== undefined) out.owner = d.owner;
  if (d.description) out.description = d.description;
  if (d.icon) out.icon = mapFile(d.icon);
  if (d.banner) out.banner = mapFile(d.banner);
  if (d.channels) out.channels = d.channels;
  if (d.categories) out.categories = d.categories.map((c) => ({ id: c.id, title: c.title, channels: c.channels }));
  if (d.default_permissions !== undefined) out.defaultPermissions = big(d.default_permissions);
  if (d.system_messages) out.systemMessages = mapSystemChannels(d.system_messages) ?? {};
  return out;
}

export function mapRolePatch(d: Partial<WRole>): Partial<Role> {
  const out: Partial<Role> = {};
  if (d.name !== undefined) out.name = d.name;
  if (d.colour) out.colour = d.colour;
  if (d.hoist !== undefined) out.hoist = d.hoist;
  if (d.rank !== undefined) out.rank = d.rank;
  if (d.permissions) out.permissions = override(d.permissions);
  return out;
}

export const SERVER_FIELDS: Record<string, (keyof Server)[]> = {
  Description: ['description'], Icon: ['icon'], Banner: ['banner'], Categories: ['categories'], SystemMessages: ['systemMessages'],
};
export const ROLE_FIELDS: Record<string, (keyof Role)[]> = { Colour: ['colour'] };
