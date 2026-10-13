import type { Message } from '@concord/domain';

/** What this account may do in the channel, and the handlers the list provides (m2a-plan.md task 3). */
export interface MessageActions {
  send: boolean; manage: boolean; react: boolean;
  /** Add or remove this account's reaction with an emoji key already on the message. */
  toggleReaction(m: Message, emoji: string): void;
  /** Open the picker in reaction mode, anchored to a button. */
  pickReaction(m: Message, anchor: HTMLElement): void;
  reply(m: Message): void; edit(m: Message): void; saveEdit(m: Message, text: string): void; cancelEdit(): void;
  delete(m: Message, skipConfirm: boolean): void; pin(m: Message): void; copyLink(m: Message): void; copyId(m: Message): void;
  select(id: string | null): void;
}
