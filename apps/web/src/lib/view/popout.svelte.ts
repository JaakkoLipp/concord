/**
 * Marks a control that opens a profile: pressing one while the popout is open moves the popout to it rather
 * than closing it first (m4.6-plan.md task 14).
 */
export const PROFILE_TRIGGER = '[data-profile-trigger]';

/** The one open profile popout (client.md section 7). */
class PopoutState {
  user = $state<string | null>(null);
  server = $state<string | undefined>(undefined);
  anchor = $state<HTMLElement | null>(null);
  side = $state<'right' | 'left'>('right');
  open(user: string, server: string | undefined, anchor: HTMLElement, side: 'right' | 'left' = 'right') {
    this.user = user;
    this.server = server;
    this.anchor = anchor;
    this.side = side;
  }
  /** Whether this user's popout is open from a trigger marked `list`, whose row then keeps its hover background. */
  shownIn(user: string, list: string): boolean {
    return this.user === user && this.anchor?.dataset.profileTrigger === list;
  }
  close() {
    this.user = null;
    this.anchor = null;
  }
}

export const popout = new PopoutState();
