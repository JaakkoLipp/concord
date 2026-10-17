/**
 * Unsent composer text per channel, with the caret position, keyed by account and channel (`<account>:<channel>`).
 * Kept in memory and in this browser's localStorage under `concord:drafts` (M4.8 task 7), so a reload doesn't lose
 * it: written on a debounce and on `pagehide`, capped in size, and wiped on logout. Only the signed-in account's
 * keys are written, so a draft written back while the composer unmounts after logout can't outlive it.
 */
export interface Draft { text: string; caret: number; at: number }
type Drafts = Record<string, Draft>;

const KEY = 'concord:drafts';
/** The most drafts stored; the oldest go first. */
export const DRAFTS_MAX = 50;
/** The most characters stored per draft, twice Stoat's message limit. */
export const DRAFT_CHARS = 4000;
const SAVE_MS = 500;

/** The stored drafts, tolerating bad data: anything malformed is dropped, and the size caps apply. */
export function parseDrafts(raw: unknown): Drafts {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Drafts = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const d = v as Partial<Draft> | null;
    if (!d || typeof d.text !== 'string' || !d.text || typeof d.caret !== 'number' || typeof d.at !== 'number') continue;
    out[k] = { text: d.text.slice(0, DRAFT_CHARS), caret: Math.max(0, Math.min(d.caret, DRAFT_CHARS)), at: d.at };
  }
  return capDrafts(out);
}

/** The newest DRAFTS_MAX drafts. */
export function capDrafts(all: Drafts): Drafts {
  const keys = Object.keys(all);
  if (keys.length <= DRAFTS_MAX) return all;
  return Object.fromEntries(keys.sort((a, b) => all[b]!.at - all[a]!.at).slice(0, DRAFTS_MAX).map((k) => [k, all[k]!]));
}

/**
 * What to store: the stored drafts, with this tab's changes (`dirty`) laid over them, so two tabs editing different
 * channels don't erase each other's drafts. A dirty key missing from `local` was cleared here.
 */
export function mergeDrafts(stored: Drafts, local: ReadonlyMap<string, Draft>, dirty: ReadonlySet<string>): Drafts {
  const out = { ...stored };
  for (const k of dirty) {
    const d = local.get(k);
    if (d) out[k] = { ...d, text: d.text.slice(0, DRAFT_CHARS) };
    else delete out[k];
  }
  return capDrafts(out);
}

function readStored(): Drafts {
  try {
    return parseDrafts(JSON.parse(localStorage.getItem(KEY) ?? '{}'));
  } catch {
    return {};
  }
}

class DraftStore {
  #all = new Map<string, Draft>();
  #dirty = new Set<string>();
  #account: string | null = null;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #listening = false;

  /** Loads the account's stored drafts, at sign-in, before the composer mounts. Other accounts' drafts are dropped. */
  open(account: string): void {
    this.#account = account;
    this.#all.clear();
    this.#dirty.clear();
    const stored = readStored();
    for (const [k, d] of Object.entries(stored)) {
      if (k.startsWith(`${account}:`)) this.#all.set(k, d);
      else this.#dirty.add(k);
    }
    if (this.#dirty.size) this.#save();
    if (!this.#listening && typeof window !== 'undefined') {
      this.#listening = true;
      window.addEventListener('pagehide', () => this.flush());
    }
  }

  get(key: string): { text: string; caret: number } | undefined {
    return this.#all.get(key);
  }

  set(key: string, text: string, caret: number): void {
    if (!this.#owned(key)) return;
    if (!text) return this.delete(key);
    this.#all.set(key, { text, caret, at: Date.now() });
    this.#touch(key);
  }

  delete(key: string): void {
    if (!this.#owned(key) || !this.#all.delete(key)) return;
    this.#touch(key);
  }

  /** Writes any pending change now, as the page goes away. */
  flush(): void {
    if (this.#timer === undefined) return;
    clearTimeout(this.#timer);
    this.#save();
  }

  /** On logout: forgets every draft, in memory and stored, and stops writing until the next sign-in. */
  clear(): void {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#account = null;
    this.#all.clear();
    this.#dirty.clear();
    try {
      localStorage.removeItem(KEY);
    } catch {
      // Storage blocked; nothing was stored.
    }
  }

  #owned(key: string): boolean {
    return this.#account !== null && key.startsWith(`${this.#account}:`);
  }

  #touch(key: string): void {
    this.#dirty.add(key);
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.#save(), SAVE_MS);
  }

  #save(): void {
    this.#timer = undefined;
    try {
      localStorage.setItem(KEY, JSON.stringify(mergeDrafts(readStored(), this.#all, this.#dirty)));
      this.#dirty.clear();
    } catch {
      // Storage blocked or full; the drafts stay in memory for this tab.
    }
  }
}

export const drafts = new DraftStore();
