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

/** A partial UserUpdate payload. `status` replaces both presence and text when present. */
export function mapUserPatch(d: Partial<WUser>): Partial<User> {
  const out: Partial<User> = {};
  if (d.username !== undefined) out.username = d.username;
  if (d.discriminator !== undefined) out.discriminator = d.discriminator;
  if (d.display_name) out.displayName = d.display_name;
  if (d.pronouns) out.pronouns = d.pronouns;
  if (d.avatar) out.avatar = mapFile(d.avatar);
  if (d.badges !== undefined) out.badges = d.badges;
  if (d.flags !== undefined) out.flags = d.flags;
  if (d.online !== undefined) out.online = d.online;
  if (d.status) {
    if (d.status.presence) out.presence = d.status.presence;
    if (d.status.text) out.statusText = d.status.text;
  }
  return out;
}

/** Stoat's names for cleared user fields, mapped to ours. */
export const USER_FIELDS: Record<string, (keyof User)[]> = {
  Avatar: ['avatar'], StatusText: ['statusText'], StatusPresence: ['presence'], DisplayName: ['displayName'], Pronouns: ['pronouns'],
};

export function mapProfile(p: { content?: string | null; background?: WFile | null }): Profile {
  return clean({ content: p.content ?? undefined, background: mapFile(p.background) }) as Profile;
}
