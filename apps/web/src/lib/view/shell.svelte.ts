/** Shell state shared by the header buttons and the panels (client.md section 5). */
const WIDE = '(min-width: 1101px)';

class ShellState {
  /** The member list or DM profile panel: open by default on wide screens, where it has its own column. */
  panelOpen = $state(typeof matchMedia === 'undefined' || matchMedia(WIDE).matches);
  /** Narrow layouts only: the slide-over sidebar. */
  sidebarOpen = $state(false);
  /** The pins or search panel, which takes the side column while open (m2a-plan.md task 8). */
  find = $state<{ channel: string; mode: 'pins' | 'search'; query: string } | null>(null);

  openFind(channel: string, mode: 'pins' | 'search', query = ''): void {
    this.find = { channel, mode, query };
    this.panelOpen = true;
  }

  constructor() {
    // Crossing the breakpoint resets the panel to that width's default, so it never covers the conversation.
    if (typeof matchMedia !== 'undefined') matchMedia(WIDE).addEventListener('change', (e) => (this.panelOpen = e.matches));
  }
}

export const shell = new ShellState();
