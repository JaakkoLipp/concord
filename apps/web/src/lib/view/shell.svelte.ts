/** Shell state shared by the header buttons and the panels (client.md section 5). */
class ShellState {
  /** The member list or DM profile panel. Shown by default on wide screens. */
  panelOpen = $state(true);
  /** Narrow layouts only: the slide-over sidebar. */
  sidebarOpen = $state(false);
}

export const shell = new ShellState();
