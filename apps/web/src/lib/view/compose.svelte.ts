/** What the composer and the message list share: the message being edited and each channel's reply. */
import type { Id } from '@concord/domain';

export interface Reply { id: Id; mention: boolean }

class Compose {
  /** The message being edited inline, if any. One at a time, as on Discord. */
  editing = $state<Id | null>(null);
  replies = $state<Record<Id, Reply>>({});
  /** Bumped to ask the composer to take focus, such as after choosing Reply. */
  focusRequest = $state(0);

  focus(): void {
    this.focusRequest++;
  }

  reply(channel: Id, id: Id): void {
    this.replies = { ...this.replies, [channel]: { id, mention: true } };
  }

  clearReply(channel: Id): void {
    const { [channel]: _gone, ...rest } = this.replies;
    this.replies = rest;
  }
}

export const compose = new Compose();
