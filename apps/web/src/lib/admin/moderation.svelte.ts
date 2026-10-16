import type { Id } from '@concord/domain';

class ModerationView {
  current = $state<{ server: Id; user: Id } | null>(null);

  open(server: Id, user: Id): void { this.current = { server, user }; }
  close(): void { this.current = null; }
}

export const moderationView = new ModerationView();
