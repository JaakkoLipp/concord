/** The admin dialog showing, if any, opened from menus anywhere in the shell. One at a time. */
import type { Id } from '@concord/domain';

export type AdminDialog =
  | { kind: 'createChannel'; server: Id; category: string | null }
  | { kind: 'category'; server: Id; id: string | null }
  | { kind: 'moveChannel'; server: Id; channel: Id }
  | { kind: 'memberRoles'; server: Id; user: Id };

class AdminDialogs {
  current = $state<AdminDialog | null>(null);
  open(d: AdminDialog): void { this.current = d; }
  close(): void { this.current = null; }
}

export const adminDialogs = new AdminDialogs();
