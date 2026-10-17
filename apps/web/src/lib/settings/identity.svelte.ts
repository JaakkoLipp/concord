/**
 * The one "confirm it's you" step of the account page (M4.8 tasks 8 and 9). Stoat wants an MFA ticket for
 * session logouts, TOTP and recovery codes, and with TOTP on also for password and email changes. A ticket works
 * once (m4.8-results.md probe 2), so every action asks here for a fresh one. With TOTP off the proof is the
 * password; with it on, an authenticator or recovery code, never the password. ConfirmIdentity.svelte shows the
 * request and makes the ticket.
 */
import type { Backend, MfaMethod } from '@concord/domain';

export interface IdentityRequest {
  backend: Backend;
  methods: MfaMethod[];
  /** What the ticket is for, completing "To …, enter your password". */
  action: string;
}

class Identity {
  request = $state<IdentityRequest | null>(null);
  #resolve: ((ticket: string | null) => void) | null = null;

  /** A fresh ticket for one action, or null if the user cancels. Rejects only if the methods can't be read. */
  async ticket(backend: Backend, action: string): Promise<string | null> {
    const methods = await backend.mfaMethods();
    this.#resolve?.(null);
    this.request = { backend, methods, action };
    return new Promise((resolve) => (this.#resolve = resolve));
  }

  /**
   * A ticket only where Stoat needs one: with TOTP on. Undefined with TOTP off, and null if the user cancels.
   * For the password and email changes.
   */
  async ticketIfTotp(backend: Backend, action: string): Promise<string | null | undefined> {
    return (await backend.mfaStatus()).totp ? this.ticket(backend, action) : undefined;
  }

  /** From the dialog: the ticket it made, or null when cancelled. */
  finish(ticket: string | null): void {
    this.#resolve?.(ticket);
    this.#resolve = null;
    this.request = null;
  }
}

export const identity = new Identity();
