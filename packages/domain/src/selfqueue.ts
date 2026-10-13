/**
 * The one queue for `PATCH /users/@me` (m2b-plan.md task 5). Stoat allows 2 a 10 s, shared by status,
 * automatic idle and profile saves, so changes merge while they wait, the newest winning, and a write goes
 * at most once every 5 s. A 429 keeps the change and tries again later.
 */
import type { SelfEdit, SelfField } from './backend.ts';
import { BackendError } from './errors.ts';

export const SELF_EVERY_MS = 5_000;

/** `b` after `a`: b's values win, a removal cancels an earlier value, and a value cancels an earlier removal. */
export function mergeEdit(a: SelfEdit, b: SelfEdit): SelfEdit {
  const out: Record<string, unknown> = { ...a };
  const removed = new Set<SelfField>(a.remove ?? []);
  for (const [k, v] of Object.entries(b)) {
    if (k === 'remove' || v === undefined) continue;
    out[k] = v;
    removed.delete(k as SelfField);
  }
  for (const f of b.remove ?? []) {
    removed.add(f);
    delete out[f];
  }
  delete out.remove;
  return (removed.size ? { ...out, remove: [...removed] } : out) as SelfEdit;
}

interface Waiter { resolve: () => void; reject: (e: unknown) => void }

export class SelfQueue {
  private pending: SelfEdit | null = null;
  private waiters: Waiter[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private last = 0;
  private busy = false;
  private readonly send: (edit: SelfEdit) => Promise<void>;

  constructor(send: (edit: SelfEdit) => Promise<void>) {
    this.send = send;
  }

  /** Resolves when a write carrying this change succeeds, and rejects with the error if it is refused. */
  push(change: SelfEdit): Promise<void> {
    this.pending = this.pending ? mergeEdit(this.pending, change) : change;
    const done = new Promise<void>((resolve, reject) => this.waiters.push({ resolve, reject }));
    this.schedule();
    return done;
  }

  /** Whether a change is waiting or on its way. */
  get active(): boolean {
    return !!this.pending || this.busy;
  }

  clear(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending = null;
    this.waiters = [];
  }

  private schedule(): void {
    if (this.timer || this.busy || !this.pending) return;
    this.timer = setTimeout(() => void this.flush(), Math.max(0, this.last + SELF_EVERY_MS - Date.now()));
  }

  private async flush(): Promise<void> {
    this.timer = null;
    const edit = this.pending;
    const waiters = this.waiters;
    this.pending = null;
    this.waiters = [];
    if (!edit) return;
    this.busy = true;
    this.last = Date.now();
    try {
      await this.send(edit);
      for (const w of waiters) w.resolve();
    } catch (e) {
      if (e instanceof BackendError && e.status === 429) {
        // Still too soon: keep it, under anything newer, for the next turn.
        this.pending = this.pending ? mergeEdit(edit, this.pending) : edit;
        this.waiters = [...waiters, ...this.waiters];
      } else {
        for (const w of waiters) w.reject(e);
      }
    } finally {
      this.busy = false;
      this.schedule();
    }
  }
}
