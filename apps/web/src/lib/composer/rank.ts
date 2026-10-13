/** Ranking for autocomplete suggestions (m2a-plan.md task 5). */

/** 0 for a match at the start, 1 at the start of a word, 2 anywhere, -1 for none. */
export function rank(name: string, query: string): number {
  if (!query) return 0;
  const n = name.toLocaleLowerCase();
  const q = query.toLocaleLowerCase();
  const i = n.indexOf(q);
  if (i < 0) return -1;
  if (i === 0) return 0;
  return /[\s._\-:]/.test(n[i - 1]!) ? 1 : 2;
}

/**
 * Items whose names match, best first: an exact match, then by rank, then a match on an earlier name
 * (the display name before the username), then alphabetically, so the order never depends on map order.
 */
export function best<T>(items: T[], names: (t: T) => string[], query: string): T[] {
  const q = query.toLocaleLowerCase();
  const score = (t: T) => {
    let s = Infinity;
    names(t).forEach((n, i) => {
      const r = rank(n, query);
      if (r >= 0) s = Math.min(s, (n.toLocaleLowerCase() === q ? -1 : r) * 10 + i);
    });
    return s;
  };
  return items
    .map((t) => ({ t, s: score(t), name: names(t)[0] ?? '' }))
    .filter((x) => x.s < Infinity)
    .sort((a, b) => a.s - b.s || a.name.localeCompare(b.name))
    .map((x) => x.t);
}
