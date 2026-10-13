/** One app-wide confirmation dialog (m2b-plan.md decision 4). `ask` resolves true when the user confirms. */
export interface Question { title: string; body: string; confirm: string; danger?: boolean }

class Confirm {
  current = $state<Question | null>(null);
  private resolve: ((ok: boolean) => void) | null = null;

  ask(q: Question): Promise<boolean> {
    this.resolve?.(false);
    this.current = q;
    return new Promise((resolve) => (this.resolve = resolve));
  }

  answer(ok: boolean): void {
    this.resolve?.(ok);
    this.resolve = null;
    this.current = null;
  }
}

export const confirm = new Confirm();
