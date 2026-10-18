/**
 * Age-restricted channels this device has confirmed (M4.8 task 14b), so each asks once. Stored per browser, not
 * synced: a device someone else may use asks again.
 */
import { SvelteSet } from 'svelte/reactivity';

const KEY = 'concord:nsfw-ok';
const KEPT = 500;

function load(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string' && id.length <= 64).slice(-KEPT) : [];
  } catch {
    return [];
  }
}

class NsfwConfirmed {
  private readonly ok = new SvelteSet<string>(typeof localStorage === 'undefined' ? [] : load());

  has(channel: string): boolean {
    return this.ok.has(channel);
  }

  confirm(channel: string): void {
    this.ok.add(channel);
    try {
      localStorage.setItem(KEY, JSON.stringify([...load().filter((id) => id !== channel), channel].slice(-KEPT)));
    } catch {
      // Private mode or full storage: it asks again next time.
    }
  }
}

export const nsfwConfirmed = new NsfwConfirmed();
