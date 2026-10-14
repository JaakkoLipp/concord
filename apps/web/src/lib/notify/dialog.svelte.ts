/** Which server or conversation the notification settings dialog shows, if any. */
import type { Id, Session } from '@concord/domain';
import type { MenuItem } from '@concord/ui';
import { m } from '$lib/i18n/index.ts';
import { toasts } from '$lib/view/toast.svelte.ts';

class NotifyDialog {
  current = $state<{ scope: 'server' | 'channel'; id: Id } | null>(null);
  open(scope: 'server' | 'channel', id: Id): void { this.current = { scope, id }; }
  close(): void { this.current = null; }
}

export const notifyDialog = new NotifyDialog();

/** Notification settings, and a quick mute until turned off or an unmute, for any menu. */
export function notifyItems(session: Session, scope: 'server' | 'channel', id: Id, kind: 'server' | 'channel' | 'conversation'): MenuItem[] {
  const store = session.store;
  const muted = scope === 'server' ? store.serverMuted(id) : store.isMuted(id);
  const labels = {
    server: [m.notify.muteServer, m.notify.unmuteServer],
    channel: [m.notify.muteChannel, m.notify.unmuteChannel],
    conversation: [m.notify.muteConversation, m.notify.unmuteConversation],
  }[kind];
  return [
    { label: m.notify.settings, onselect: () => notifyDialog.open(scope, id) },
    { label: muted ? labels[1]! : labels[0]!, onselect: () => void session.setMute(scope, id, muted ? false : null).catch(() => toasts.show(m.notify.failed)) },
  ];
}
