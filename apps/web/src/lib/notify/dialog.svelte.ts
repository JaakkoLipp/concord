/** Which server or conversation the notification settings dialog shows, if any. */
import type { Id, Session } from '@concord/domain';
import type { NotificationLevel } from '@concord/domain';
import type { MenuItem } from '@concord/ui';
import { m } from '$lib/i18n/index.ts';
import { toasts } from '$lib/view/toast.svelte.ts';

class NotifyDialog {
  current = $state<{ scope: 'server' | 'channel'; id: Id } | null>(null);
  open(scope: 'server' | 'channel', id: Id): void { this.current = { scope, id }; }
  close(): void { this.current = null; }
}

export const notifyDialog = new NotifyDialog();

/** Notification settings, for any menu. */
export function notifySettingsItem(scope: 'server' | 'channel', id: Id): MenuItem {
  return { label: m.notify.settings, onselect: () => notifyDialog.open(scope, id) };
}

/** Server notification level picker, with the current level shown on its parent row. */
export function serverNotificationSettingsItem(session: Session, id: Id): MenuItem {
  const current = session.store.settings.notifications.server[id] ?? 'mention';
  const levels: NotificationLevel[] = ['all', 'mention', 'none'];
  return {
    kind: 'submenu', label: m.notify.settings, detail: m.notify.levels[current],
    items: levels.map((level) => ({
      kind: 'check', label: m.notify.levels[level], checked: current === level,
      onselect: () => void session.setNotificationLevel('server', id, level).catch(() => toasts.show(m.notify.failed)),
    })),
  };
}

/** A quick mute until turned off, or an unmute, for any menu. */
export function notifyMuteItem(session: Session, scope: 'server' | 'channel', id: Id, kind: 'server' | 'channel' | 'conversation'): MenuItem {
  const store = session.store;
  const muted = scope === 'server' ? store.serverMuted(id) : store.isMuted(id);
  const labels = {
    server: [m.notify.muteServer, m.notify.unmuteServer],
    channel: [m.notify.muteChannel, m.notify.unmuteChannel],
    conversation: [m.notify.muteConversation, m.notify.unmuteConversation],
  }[kind];
  return { label: muted ? labels[1]! : labels[0]!, onselect: () => void session.setMute(scope, id, muted ? false : null).catch(() => toasts.show(m.notify.failed)) };
}

/** Notification settings, then the quick mute. */
export function notifyItems(session: Session, scope: 'server' | 'channel', id: Id, kind: 'server' | 'channel' | 'conversation'): MenuItem[] {
  return [notifySettingsItem(scope, id), notifyMuteItem(session, scope, id, kind)];
}
