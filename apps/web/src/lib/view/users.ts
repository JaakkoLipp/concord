/** View helpers shared by components: avatar URLs and presence states. */
import type { FileRef, User } from '@concord/domain';
import type { PresenceState } from '@concord/ui';
import { fileUrl } from '@concord/stoat';

/** An avatar sized for display. Users without one get Stoat's generated default avatar. */
export function avatarUrl(user: Pick<User, 'id' | 'avatar'> | undefined, file?: FileRef): string {
  const f = file ?? user?.avatar;
  if (f) return fileUrl(f, { maxSide: 256 });
  return user ? `/api/users/${user.id}/default_avatar` : '';
}

export function presenceOf(user: Pick<User, 'online' | 'presence'> | undefined): PresenceState {
  if (!user?.online || user.presence === 'Invisible') return 'offline';
  switch (user.presence) {
    case 'Idle': return 'idle';
    case 'Busy': return 'busy';
    case 'Focus': return 'focus';
    default: return 'online';
  }
}
