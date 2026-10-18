/** One app-wide confirmation dialog (m2b-plan.md decision 4). `ask` resolves true when the user confirms. */
export interface Question {
  title: string;
  body: string;
  confirm: string;
  danger?: boolean;
  /** Text the user must type before confirming, such as a channel's name (m4.7-plan.md task 11). */
  typed?: string;
  /** Offer an optional reason for the audit log; `askReason` returns it. */
  reason?: boolean;
}

class Confirm {
  current = $state<Question | null>(null);
  typedValue = $state('');
  reasonValue = $state('');
  private resolve: ((ok: boolean) => void) | null = null;
  private lastReason = '';

  ask(q: Question): Promise<boolean> {
    this.resolve?.(false);
    this.current = q;
    this.typedValue = '';
    this.reasonValue = '';
    return new Promise((resolve) => (this.resolve = resolve));
  }

  /** Ask with a reason field: the reason, empty for none, or null when cancelled. */
  async askReason(q: Question): Promise<string | null> {
    return (await this.ask({ ...q, reason: true })) ? this.lastReason : null;
  }

  /** Whether the typed text, if one is asked for, matches. */
  get ready(): boolean {
    return !this.current?.typed || this.typedValue.trim() === this.current.typed.trim();
  }

  answer(ok: boolean): void {
    if (ok && !this.ready) return;
    this.lastReason = this.reasonValue.trim();
    this.resolve?.(ok);
    this.resolve = null;
    this.current = null;
  }
}

export const confirm = new Confirm();
