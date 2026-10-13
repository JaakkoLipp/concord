/** One emoji picker for the whole app, opened by the composer, the action bar and reaction chips. */
export type Picked = { kind: 'unicode'; value: string } | { kind: 'custom'; value: string };

interface Request {
  anchor: HTMLElement;
  /** Reactions offer only what the backend accepts (m2a-plan.md task 4). */
  mode: 'insert' | 'react';
  onpick: (emoji: Picked) => void;
}

class Picker {
  request = $state<Request | null>(null);

  open(anchor: HTMLElement, mode: Request['mode'], onpick: Request['onpick']): void {
    this.request = { anchor, mode, onpick };
  }

  close(): void {
    this.request = null;
  }
}

export const picker = new Picker();
