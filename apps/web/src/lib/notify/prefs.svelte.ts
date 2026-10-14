/**
 * Desktop notifications are turned on per browser (m2c-plan.md decision 6): `on`, `off`, or not yet asked,
 * when the enable bar shows. The browser's own permission is tracked beside it.
 */
const KEY = 'concord:notifications';
type Choice = 'on' | 'off' | null;

const supported = () => typeof Notification !== 'undefined';

function read(): Choice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'on' || v === 'off' ? v : null;
  } catch {
    return null;
  }
}

class NotifyPrefs {
  choice = $state<Choice>(read());
  permission = $state<NotificationPermission | 'unsupported'>(supported() ? Notification.permission : 'unsupported');

  /** Notifications will show: chosen here and allowed by the browser. */
  get active(): boolean {
    return this.choice === 'on' && this.permission === 'granted';
  }

  /** The bar asks once: until a choice is made, while the browser hasn't said no. */
  get ask(): boolean {
    return this.choice === null && this.permission === 'default';
  }

  private save(choice: Choice): void {
    this.choice = choice;
    try {
      if (choice) localStorage.setItem(KEY, choice);
    } catch {
      // Storage blocked: the choice lasts until the tab closes.
    }
  }

  /** Must run from a click: Firefox only asks for permission then. */
  async enable(): Promise<void> {
    if (!supported()) return;
    if (Notification.permission === 'default') this.permission = await Notification.requestPermission();
    else this.permission = Notification.permission;
    this.save(this.permission === 'granted' ? 'on' : 'off');
  }

  disable(): void {
    this.save('off');
  }

  /** Another tab changed the choice, or the browser's permission changed. */
  refresh(): void {
    this.choice = read();
    if (supported()) this.permission = Notification.permission;
  }
}

export const notifyPrefs = new NotifyPrefs();
