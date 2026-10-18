/** ULIDs for client-made IDs, such as a pending message's idempotency key. They sort by time like Stoat's. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** The shape of a Stoat ID: 26 characters of Crockford's base 32. */
export const ULID_PATTERN = '[0-9A-HJKMNP-TV-Z]{26}';
const ULID_ONLY = new RegExp(`^${ULID_PATTERN}$`);
export const isUlid = (s: unknown): s is string => typeof s === 'string' && ULID_ONLY.test(s);

function timePart(ms: number): string {
  let time = '';
  for (let t = Math.max(0, Math.floor(ms)), i = 0; i < 10; i++, t = Math.floor(t / 32)) time = ALPHABET[t % 32]! + time;
  return time;
}

/** The smallest ULID made at this time: a search bound, since every message from that millisecond on sorts after it. */
export function ulidFloor(ms: number): string {
  return timePart(ms) + '0'.repeat(16);
}

export function ulid(now = Date.now()): string {
  const time = timePart(now);
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let random = '';
  for (const b of bytes) random += ALPHABET[b % 32]!;
  return time + random;
}

/** The time a ULID was made, in milliseconds. */
export function ulidTime(id: string): number {
  let t = 0;
  for (const ch of id.slice(0, 10)) t = t * 32 + ALPHABET.indexOf(ch);
  return t;
}
