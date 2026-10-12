import type { Emoji } from '@concord/domain';
import type { WEmoji } from './wire.ts';

export function mapEmoji(e: WEmoji): Emoji {
  return {
    id: e._id,
    parent: e.parent.type === 'Server' ? { type: 'server', id: e.parent.id } : { type: 'detached' },
    creator: e.creator_id,
    name: e.name,
    animated: e.animated ?? false,
  };
}
