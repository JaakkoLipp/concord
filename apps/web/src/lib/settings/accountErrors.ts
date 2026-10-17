/** What went wrong with an account action, for the account page and its dialogs (M4.8 tasks 8 and 9). */
import { StoatError } from '@concord/stoat';
import { m } from '$lib/i18n/index.ts';

export function accountError(e: unknown): string {
  const t = m.account.errors;
  if (e instanceof StoatError) {
    if (e.status === 429) return t.rateLimited;
    switch (e.kind) {
      case 'InvalidCredentials': return t.password;
      // A wrong or reused code, or a password where Stoat wants a code.
      case 'InvalidToken': case 'DisallowedMFAMethod': return t.code;
      case 'ShortPassword': return t.short;
      case 'CompromisedPassword': return t.compromised;
      case 'IncorrectData': return t.email;
    }
    return t.unknown;
  }
  return e instanceof TypeError ? t.network : t.unknown;
}
