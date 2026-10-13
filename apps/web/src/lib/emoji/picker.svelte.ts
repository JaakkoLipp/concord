/** One emoji picker for the whole app, opened by the composer, the action bar and reaction chips. */
export type Picked = { kind: 'unicode'; value: string } | { kind: 'custom'; value: string };

interface Request {
  anchor: HTMLElement;
  /**
   * Reactions offer only what the backend accepts (m2a-plan.md task 4). A status is plain text, so it
   * offers Unicode emoji only.
   */
  mode: 'insert' | 'react' | 'unicode';
  onpick: (emoji: Picked) => void;
  /**
   * Which mounted picker shows it. A modal dialog makes everything outside it inert, so a dialog that wants
   * the picker mounts its own and names it here.
   */
  host: string;
}

class Picker {
  request = $state<Request | null>(null);

  open(anchor: HTMLElement, mode: Request['mode'], onpick: Request['onpick'], host = 'shell'): void {
    this.request = { anchor, mode, onpick, host };
  }

  close(): void {
    this.request = null;
  }
}

export const picker = new Picker();
