import type { FavouriteGif, Message } from '@concord/domain';

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
  /** The context menu's extras (m4.5-plan.md task 2). `key` is a quick reaction's emoji, as the picker hands it over. */
  quickReact(m: Message, key: string): void;
  markUnread(m: Message): void; copyText(m: Message): void;
  /** Opens a web address; with the text it was shown as, a masked link asks first. */
  openUrl(url: string, text?: string): void; copyUrl(url: string): void;
  copyImage(src: string): void; saveImage(src: string, name: string): void;
  isFavouriteGif(url: string): boolean; toggleFavouriteGif(gif: FavouriteGif): void;
  /** Start selecting messages to delete together, from this one, for server admins only (m4.7-plan.md task 7). */
  pick?: ((m: Message) => void) | undefined;
  /** Report someone else's message, through Concord's layer (m4.7-plan.md task 9). */
  report?: ((m: Message) => void) | undefined;
}
