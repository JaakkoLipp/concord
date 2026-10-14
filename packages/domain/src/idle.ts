/**
 * Automatic idle (m2b-plan.md task 6, client.md section 7). One tracker runs per browser, in the tab that
 * holds the idle lock. It goes Idle when no device has been used for 10 minutes, and comes back Online on
 * input, but only while the chosen status is Online, so a status the user picked is never overridden.
 *
 * "Used" means input in this browser, or `concord:active` from another device. A device writes that key
 * at most every 4 minutes while in use, and at once when it comes back. The key's arrival is timed on this
 * device's clock, so clock skew between devices can't move the deadline.
 *
 * Being in a call counts as use too (client.md section 7). Stoat's voice states are the account's, so every
 * tab and device sees a call on any of them, and none goes Idle while it lasts.
 */
import type { Presence } from './entities.ts';

export const AWAY_MS = 10 * 60_000;
export const ACTIVE_EVERY_MS = 4 * 60_000;
/** Synced-settings key: when any device of this account last had input. */
export const ACTIVE_KEY = 'concord:active';
/** How often the tracker looks again while the account is in a call, so leaving one starts the 10 minutes. */
export const CALL_CHECK_MS = 60_000;

export interface IdleDeps {
  now(): number;
  /** This account's live presence, as Stoat last reported it. */
  presence(): Presence | undefined;
  /** The status chosen in the menu, or null when none was saved. */
  chosen(): Presence | null;
  setPresence(presence: 'Idle' | 'Online'): void;
  writeActive(at: number): void;
  /** Whether this account is in a call, on any device. */
  inCall?(): boolean;
}

export class IdleTracker {
  private lastInput: number;
  private remoteActive = 0;
  private lastWritten = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private lastPresence: Presence | undefined;
  private readonly deps: IdleDeps;

  constructor(deps: IdleDeps) {
    this.deps = deps;
    this.lastInput = deps.now();
  }

  /** Start acting: this tab now holds the lock. Opening the app counts as being here. */
  start(): void {
    this.running = true;
    this.lastPresence = this.deps.presence();
    this.lastInput = Math.max(this.lastInput, this.deps.now());
    this.schedule();
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Input in this browser, at the given time: this tab's own, or another tab's through storage. */
  input(at = this.deps.now()): void {
    const wasAway = this.deps.now() - this.lastActive() >= AWAY_MS;
    this.lastInput = Math.max(this.lastInput, at);
    if (!this.running) return;
    const back = this.deps.presence() === 'Idle' && this.chosenOnline();
    // The activity notice goes first, so other devices learn of it before they see the presence change.
    if (back || wasAway || this.deps.now() - this.lastWritten >= ACTIVE_EVERY_MS) {
      this.lastWritten = this.deps.now();
      this.deps.writeActive(this.lastWritten);
    }
    if (back) this.deps.setPresence('Online');
    this.schedule();
  }

  /**
   * Another device of this account was used. Live, the arrival time counts; at start-up, the written time,
   * never later than now.
   */
  remote(written?: number): void {
    const at = written === undefined ? this.deps.now() : Math.min(written, this.deps.now());
    this.remoteActive = Math.max(this.remoteActive, at);
    if (this.running) this.schedule();
  }

  /**
   * The presence changed, from any device. Idle turning Online means someone came back somewhere, even if
   * their activity notice hasn't arrived yet: count it as activity, or this device would set Idle again.
   */
  presenceChanged(): void {
    const now = this.deps.presence();
    if (this.lastPresence === 'Idle' && now === 'Online') this.remoteActive = Math.max(this.remoteActive, this.deps.now());
    this.lastPresence = now;
    if (this.running) this.schedule();
  }

  lastActive(): number {
    return Math.max(this.lastInput, this.remoteActive);
  }

  private chosenOnline(): boolean {
    return (this.deps.chosen() ?? 'Online') === 'Online';
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.check(), Math.max(0, this.lastActive() + AWAY_MS - this.deps.now()));
  }

  private check(): void {
    this.timer = null;
    if (!this.running) return;
    if (this.deps.inCall?.()) {
      // In a call: that is use, though nothing is written, since every device sees the call itself.
      this.lastInput = Math.max(this.lastInput, this.deps.now());
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => this.check(), CALL_CHECK_MS);
      return;
    }
    if (this.deps.now() - this.lastActive() < AWAY_MS) return this.schedule();
    // Away. Go Idle only from an Online the user didn't override: not Busy, Focus or Invisible, from
    // this client's menu or from another Stoat client.
    if (this.chosenOnline() && (this.deps.presence() ?? 'Online') === 'Online') this.deps.setPresence('Idle');
  }
}
