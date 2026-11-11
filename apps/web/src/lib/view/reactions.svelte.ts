/** Which message's "who reacted" list is open (m4.3-plan.md task 4), app-wide, as the confirmation dialog is. */
import type { Id } from '@concord/domain';

class ReactionsView {
  current = $state<{ message: Id; emoji?: string | undefined } | null>(null);

  /** `emoji` picks the reaction shown first, as from a chip's own menu. */
  open(message: Id, emoji?: string): void {
    this.current = { message, emoji };
  }

  close(): void {
    this.current = null;
  }
}

export const reactionsView = new ReactionsView();
