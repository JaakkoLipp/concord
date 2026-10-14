/**
 * The app's one session. Created on demand in the browser; the (app) route group never renders on the server.
 */
import { Session } from '@concord/domain';
import { LiveTransport, StoatBackend, StoatError } from '@concord/stoat';
import { drafts } from '$lib/composer/drafts.ts';
import { clearToken, loadToken, saveToken } from './token.ts';
import { watchIdle } from './idle.ts';
import { watchNotifications } from '$lib/notify/watch.ts';
import { m } from '$lib/i18n/index.ts';
import { toasts } from '$lib/view/toast.svelte.ts';
import { VoiceController } from '$lib/voice/controller.svelte.ts';
import { Rings } from '$lib/voice/rings.svelte.ts';

// The (app) group has ssr = false, so this only runs in the browser; the guard keeps server builds importable.
export const backend = new StoatBackend(new LiveTransport(typeof location === 'undefined' ? 'http://localhost' : location.origin));

class App {
  session = $state<Session | null>(null);
  /** The session's voice controller (client.md section 10). */
  voice = $state<VoiceController | null>(null);
  /** DM and group calls ringing this account (client.md section 10.8). */
  rings = $state<Rings | null>(null);
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
  private stopNotify: (() => void) | null = null;

  private async start(token: string): Promise<void> {
    const session = new Session(backend);
    await session.start(token, () => void this.signedOut());
    this.stopIdle = watchIdle(session);
    this.stopNotify = watchNotifications(session);
    // Leaving needs no notice; the open conversation goes to the Friends screen on its own when its channel goes.
    session.onServerRemoved((r) => {
      if (r.reason !== 'left') toasts.show(m.admin.removed[r.reason](r.name), 'info');
    });
    this.voice = new VoiceController(session);
    this.rings = new Rings(session, this.voice);
    this.session = session;
    this.status = 'signed-in';
  }

  async signOut(): Promise<void> {
    await this.session?.logout();
    await this.signedOut();
  }

  private async signedOut(): Promise<void> {
    this.rings?.destroy();
    this.rings = null;
    this.voice?.destroy();
    this.voice = null;
    this.stopIdle?.();
    this.stopIdle = null;
    this.stopNotify?.();
    this.stopNotify = null;
    await this.session?.stop();
    this.session = null;
    drafts.clear();
    await clearToken();
    this.status = 'signed-out';
  }
}

export const app = new App();
