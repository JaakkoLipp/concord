/**
 * Unicode emoji render as Twemoji SVGs from our own origin (client.md section 6.4), copied into the build
 * by tools/assets/twemoji.ts. Twemoji names files by code point, dropping U+FE0F outside ZWJ sequences.
 */
export function twemojiName(sequence: string): string {
  const points = [...sequence].map((c) => c.codePointAt(0)!);
  const keep = points.includes(0x200d) ? points : points.filter((p) => p !== 0xfe0f);
  const name = keep.map((p) => p.toString(16)).join('-');
  // The one ZWJ sequence Twemoji names without its U+FE0F: eye in speech bubble.
  return name === '1f441-fe0f-200d-1f5e8-fe0f' ? '1f441-200d-1f5e8' : name;
}

export const twemojiUrl = (sequence: string) => `/app/emoji/${twemojiName(sequence)}.svg`;
export const customEmojiUrl = (id: string) => `/autumn/emojis/${id}`;
