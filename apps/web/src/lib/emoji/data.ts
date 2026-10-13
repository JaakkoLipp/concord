/**
 * Unicode emoji for the picker and `:` autocomplete (client.md section 6.4): names, GitHub-style shortcodes
 * and search terms from emojibase, at Emoji 15.0 to match the Twemoji images. Loaded on first use.
 */
export interface UnicodeEmoji {
  unicode: string;
  name: string;
  /** emojibase group: 0 smileys, 1 people, 3 animals, 4 food, 5 travel, 6 activities, 7 objects, 8 symbols, 9 flags. */
  group: number;
  shortcode: string;
  /** Lower-case name, shortcodes and tags, for search. */
  terms: string;
}

export const GROUPS = [0, 1, 3, 4, 5, 6, 7, 8, 9] as const;
export type Group = (typeof GROUPS)[number];

interface Compact { hexcode: string; label: string; unicode: string; group?: number; order?: number; tags?: string[] }

let loaded: Promise<UnicodeEmoji[]> | null = null;

export function unicodeEmoji(): Promise<UnicodeEmoji[]> {
  loaded ??= Promise.all([import('emojibase-data/en/compact.json'), import('emojibase-data/en/shortcodes/github.json')]).then(([c, s]) => {
    const codes = s.default as Record<string, string | string[]>;
    return (c.default as Compact[])
      .filter((e) => e.group !== undefined && e.group !== 2)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((e) => {
        const sc = codes[e.hexcode];
        const list = sc === undefined ? [] : Array.isArray(sc) ? sc : [sc];
        return {
          unicode: e.unicode,
          name: e.label,
          group: e.group!,
          shortcode: list[0] ?? e.label.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
          terms: [e.label, ...list, ...(e.tags ?? [])].join(' ').toLowerCase(),
        };
      });
  });
  return loaded;
}

const FE0F = /️/g;

/** The reaction key to use: one already on the message that differs only by U+FE0F, or the emoji itself. */
export function reactionKey(existing: string[], emoji: string): string {
  const bare = emoji.replace(FE0F, '');
  return existing.find((k) => k.replace(FE0F, '') === bare) ?? emoji;
}
