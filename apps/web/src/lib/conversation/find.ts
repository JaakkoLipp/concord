/**
 * Search filters (m4.8-plan.md task 12). Stoat searches one channel by text and by `before` and `after`
 * IDs, and has no author field, so "from someone" filters pages on the client and keeps paging until it
 * has a page of matches, runs out, or reaches its page budget.
 */
import { ulidFloor, type Message } from '@concord/domain';

export interface FindFilters {
  /** A user ID. */
  from?: string | undefined;
  /** Local calendar days, `YYYY-MM-DD`, as a date input gives them. Both exclusive, as on Discord. */
  after?: string | undefined;
  before?: string | undefined;
}

/** Local midnight at the start of a `YYYY-MM-DD` day, plus `days`; undefined for anything else. */
export function dayStart(day: string | undefined, days = 0): number | undefined {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day ?? '');
  if (!parts) return undefined;
  const t = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]) + days).getTime();
  return Number.isNaN(t) ? undefined : t;
}

/** Stoat's ID bounds for the days: before the start of `before`, after the end of `after`. */
export function bounds(f: FindFilters): { before?: string; after?: string } {
  const before = dayStart(f.before);
  const after = dayStart(f.after, 1);
  return { ...(before !== undefined ? { before: ulidFloor(before) } : {}), ...(after !== undefined ? { after: ulidFloor(after) } : {}) };
}

export interface Collected {
  matches: Message[];
  /** Messages read, matching or not. */
  scanned: number;
  /** Where the next page starts, or undefined when the channel has no more. */
  next: string | undefined;
}

/**
 * Reads pages (newest first) from `before` on, keeping those `keep` accepts, until there are `want` of
 * them, a short page says the channel is done, or `maxPages` pages were read.
 */
export async function collect(
  page: (before: string | undefined) => Promise<Message[]>,
  opts: { limit: number; want: number; maxPages: number; keep: (m: Message) => boolean; before?: string | undefined },
): Promise<Collected> {
  const matches: Message[] = [];
  let scanned = 0;
  let next = opts.before;
  for (let i = 0; i < opts.maxPages; i++) {
    const got = await page(next);
    scanned += got.length;
    matches.push(...got.filter(opts.keep));
    next = got.length === opts.limit ? got.at(-1)!.id : undefined;
    if (!next || matches.length >= opts.want) break;
  }
  return { matches, scanned, next };
}
