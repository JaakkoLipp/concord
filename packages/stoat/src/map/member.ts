import type { Member } from '@concord/domain';
import { mapFile } from './file.ts';
import { clean, type WMember } from './wire.ts';

export function mapMember(m: WMember): Member {
  return clean({
    server: m._id.server, user: m._id.user, joinedAt: m.joined_at, nickname: m.nickname ?? undefined, avatar: mapFile(m.avatar),
    roles: m.roles ?? [], timeout: m.timeout ?? undefined, canPublish: m.can_publish ?? true, canReceive: m.can_receive ?? true,
  }) as Member;
}

export function mapMemberPatch(d: Partial<WMember>): Partial<Member> {
  const out: Partial<Member> = {};
  if (d.nickname) out.nickname = d.nickname;
  if (d.avatar) out.avatar = mapFile(d.avatar);
  if (d.roles) out.roles = d.roles;
  if (d.timeout) out.timeout = d.timeout;
  if (typeof d.can_publish === 'boolean') out.canPublish = d.can_publish;
  if (typeof d.can_receive === 'boolean') out.canReceive = d.can_receive;
  return out;
}

/** `CanPublish` and `CanReceive` clear to their default, true; the event mapper turns them into data. */
export const MEMBER_FIELDS: Record<string, (keyof Member)[]> = {
  Nickname: ['nickname'], Avatar: ['avatar'], Roles: ['roles'], Timeout: ['timeout'], CanPublish: ['canPublish'], CanReceive: ['canReceive'],
};
