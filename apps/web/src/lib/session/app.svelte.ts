/**
 * The app's one session. Created on demand in the browser; the (app) route group never renders on the server.
 */
import { Session } from '@concord/domain';
import { LiveTransport, StoatBackend, StoatError } from '@concord/stoat';
import { drafts } from '$lib/composer/drafts.ts';
import { clearToken, loadToken, saveToken } from './token.ts';
import { watchIdle } from './idle.ts';

// The (app) group has ssr = false, so this only runs in the browser; the guard keeps server builds importable.
export const backend = new StoatBackend(new LiveTransport(typeof location === 'undefined' ? 'http://localhost' : location.origin));

class App {
  session = $state<Session | null>(null);
  /** 'checking' until the stored token has been tried. */
  status = $state<'checking' | 'signed-out' | 'signed-in'>('checking');

  async restore(): Promise<void> {
    if (this.session) return;
    const token = await loadToken();
    if (!token) {
      this.status = 'signed-out';
      return;
    }
    await this.start(token).catch(async (e: unknown) => {
      // A rejected token means signed out. Anything else (offline, server down) keeps the token for a retry.
      if (e instanceof StoatError && e.status === 401) await clearToken();
      this.status = 'signed-out';
    });
  }

  async signIn(token: string): Promise<void> {
    await saveToken(token);
    await this.start(token);
  }

  private stopIdle: (() => void) | null = null;

  private async start(token: string): Promise<void> {
    const session = new Session(backend);
    await session.start(token, () => void this.signedOut());
    this.stopIdle = watchIdle(session);
    this.session = session;
    this.status = 'signed-in';
  }

  async signOut(): Promise<void> {
    await this.session?.logout();
    await this.signedOut();
  }

  private async signedOut(): Promise<void> {
    this.stopIdle?.();
    this.stopIdle = null;
    await this.session?.stop();
    this.session = null;
    drafts.clear();
    await clearToken();
    this.status = 'signed-out';
  }
}

export const app = new App();
