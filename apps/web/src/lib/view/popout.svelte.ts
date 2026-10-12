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
  close() {
    this.user = null;
    this.anchor = null;
  }
}

export const popout = new PopoutState();
