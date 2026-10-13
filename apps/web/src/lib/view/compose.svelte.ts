/** What the composer and the message list share: the message being edited and each channel's reply. */
import type { Id } from '@concord/domain';

export interface Reply { id: Id; mention: boolean }

/** A file chosen for the next message, with a local preview for images. */
export interface Chosen { key: string; file: File; preview?: string | undefined }

class Compose {
  /** The message being edited inline, if any. One at a time, as on Discord. */
  editing = $state<Id | null>(null);
  replies = $state<Record<Id, Reply>>({});
  /** Files chosen per channel, sent with the next message (m2a-plan.md task 6). */
  files = $state<Record<Id, Chosen[]>>({});

  addFiles(channel: Id, chosen: Chosen[]): void {
    this.files = { ...this.files, [channel]: [...(this.files[channel] ?? []), ...chosen] };
  }

  removeFile(channel: Id, key: string): void {
    const gone = this.files[channel]?.find((c) => c.key === key);
    if (gone?.preview) URL.revokeObjectURL(gone.preview);
    this.files = { ...this.files, [channel]: (this.files[channel] ?? []).filter((c) => c.key !== key) };
  }

  /** Hand the chosen files to a message. Their previews now belong to the pending message. */
  takeFiles(channel: Id): Chosen[] {
    const taken = this.files[channel] ?? [];
    const { [channel]: _gone, ...rest } = this.files;
    this.files = rest;
    return taken;
  }

  /** Bumped to ask the message list to go to the newest message, such as on sending. */
  presentRequest = $state(0);

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
