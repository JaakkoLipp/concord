/**
 * Unicode emoji render as Twemoji SVGs from our own origin (client.md section 6.4), copied into the build
 * by tools/assets/twemoji.ts. Twemoji names files by code point, dropping U+FE0F outside ZWJ sequences.
 */
export function twemojiName(sequence: string): string {
  const points = [...sequence].map((c) => c.codePointAt(0)!);
  const keep = points.includes(0x200d) ? points : points.filter((p) => p !== 0xfe0f);
  return keep.map((p) => p.toString(16)).join('-');
}

export const twemojiUrl = (sequence: string) => `/app/emoji/${twemojiName(sequence)}.svg`;
export const customEmojiUrl = (id: string) => `/autumn/emojis/${id}`;
