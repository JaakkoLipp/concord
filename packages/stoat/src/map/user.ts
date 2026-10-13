import type { Profile, User } from '@concord/domain';
import { mapFile } from './file.ts';
import { clean, type WFile, type WUser } from './wire.ts';

export function mapUser(u: WUser): User {
  return clean({
    id: u._id,
    username: u.username,
    discriminator: u.discriminator,
    displayName: u.display_name ?? undefined,
    pronouns: u.pronouns ?? undefined,
    avatar: mapFile(u.avatar),
    badges: u.badges ?? 0,
    flags: u.flags ?? 0,
    online: u.online,
    presence: u.status?.presence ?? undefined,
    statusText: u.status?.text ?? undefined,
    relationship: u.relationship,
    bot: u.bot ? { owner: u.bot.owner } : undefined,
  }) as User;
}

/**
 * A partial UserUpdate payload. `status` arrives whole, text and presence together, so a part it lacks has
 * been removed: those fields are returned in `clear`. An empty string is a value, not a removal.
 */
export function mapUserPatch(d: Partial<WUser>): { data: Partial<User>; clear: (keyof User)[] } {
  const out: Partial<User> = {};
  const clear: (keyof User)[] = [];
  if (d.username != null) out.username = d.username;
  if (d.discriminator != null) out.discriminator = d.discriminator;
  if (d.display_name != null) out.displayName = d.display_name;
  if (d.pronouns != null) out.pronouns = d.pronouns;
  if (d.avatar) out.avatar = mapFile(d.avatar);
  if (d.badges != null) out.badges = d.badges;
  if (d.flags != null) out.flags = d.flags;
  if (d.online != null) out.online = d.online;
  if (d.status) {
    if (d.status.presence != null) out.presence = d.status.presence;
    else clear.push('presence');
    if (d.status.text != null) out.statusText = d.status.text;
    else clear.push('statusText');
  }
  return { data: out, clear };
}

/** Stoat's names for cleared user fields, mapped to ours. */
export const USER_FIELDS: Record<string, (keyof User)[]> = {
  Avatar: ['avatar'], StatusText: ['statusText'], StatusPresence: ['presence'], DisplayName: ['displayName'], Pronouns: ['pronouns'],
};

export function mapProfile(p: { content?: string | null; background?: WFile | null }): Profile {
  return clean({ content: p.content ?? undefined, background: mapFile(p.background) }) as Profile;
}
