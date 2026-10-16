/**
 * The quick switcher's state (M4.8 task 3), in the pattern of shortcutsDialog.svelte.ts. `still` is set when it is
 * opened from the keyboard, so it doesn't animate (client.md section 9, rule 2). The recent places are a device
 * list per account, under `concord:recent`, read and written here; every storage access is wrapped, since storage
 * can be blocked and the list is only a convenience.
 */
class Switcher {
  open = $state(false);
  still = $state(false);
  query = $state('');
  selected = $state(0);

  show(fromKeyboard: boolean): void {
    this.still = fromKeyboard;
    this.query = '';
    this.selected = 0;
    this.open = true;
  }

  close(): void {
    this.open = false;
  }
}

export const switcher = new Switcher();

const KEY = 'concord:recent';
/** The most recent channels and DMs kept per account. */
export const RECENT_MAX = 10;

type RecentByAccount = Record<string, unknown>;

function readAll(): RecentByAccount {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as RecentByAccount) : {};
  } catch {
    return {};
  }
}

/** This account's recent channel and DM IDs, newest first. */
export function recentPlaces(account: string): string[] {
  const list = readAll()[account];
  return Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string').slice(0, RECENT_MAX) : [];
}

/** Puts a channel or DM at the front of this account's recent places. */
export function rememberPlace(account: string, id: string): void {
  try {
    const all = readAll();
    all[account] = [id, ...recentPlaces(account).filter((x) => x !== id)].slice(0, RECENT_MAX);
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Storage blocked; nothing to remember.
  }
}

/**
 * Drops every account's recent places, on sign-out (client.md section 13). Unconditional: by the time the sign-out
 * runs, the store has already let go of the account, so it can't say whose list to drop.
 */
export function clearRecent(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Storage blocked; nothing to clear.
  }
}
