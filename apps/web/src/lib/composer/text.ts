/**
 * The composer's text is Stoat's own message syntax, so what the editor holds is what gets sent
 * (m2a-plan.md decision 1). Mentions, channel links and custom emoji are tokens in that text.
 */

const ULID = '[0-9A-HJKMNP-TV-Z]{26}';

export type TokenKind = 'user' | 'role' | 'channel' | 'emoji';

/** `<@ID>`, `<%ID>`, `<#ID>` and `:ID:`, as Stoat's renderer reads them. */
export const TOKEN = new RegExp(`<([@%#])(${ULID})>|:(${ULID}):`, 'g');

export function tokenAt(match: RegExpExecArray): { kind: TokenKind; id: string } {
  if (match[3]) return { kind: 'emoji', id: match[3] };
  return { kind: match[1] === '@' ? 'user' : match[1] === '%' ? 'role' : 'channel', id: match[2]! };
}

export const serialise = {
  user: (id: string) => `<@${id}>`,
  role: (id: string) => `<%${id}>`,
  channel: (id: string) => `<#${id}>`,
  emoji: (id: string) => `:${id}:`,
} satisfies Record<TokenKind, (id: string) => string>;

const encoder = new TextEncoder();

/** Stoat limits messages to 2000 UTF-8 bytes, not characters (m0-results.md section 2). */
export const byteLength = (text: string) => encoder.encode(text).length;

/** The text as sent: surrounding blank lines and spaces trimmed. Empty means nothing to send. */
export const outgoing = (text: string) => text.trim();

/** The counter shows from this many bytes left, as Discord shows its counter near the limit. */
export const COUNTER_FROM = 200;

export type QueryKind = '@' | '#' | ':';

/**
 * The autocomplete query the caret is in, from the text before it on its line: `@` for members and roles,
 * `#` for channels, `:` for emoji from two characters on. It must start a word.
 */
export function activeQuery(before: string): { kind: QueryKind; query: string; start: number } | null {
  const m = /(^|[\s(])([@#:])([^\s@#:<>]*)$/u.exec(before);
  if (!m) return null;
  const kind = m[2] as QueryKind;
  const query = m[3]!;
  if (kind === ':' && query.length < 2) return null;
  if (query.length > 32) return null;
  return { kind, query, start: before.length - query.length - 1 };
}
