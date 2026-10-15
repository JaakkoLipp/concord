/**
 * Input checks (architecture section 11.2). IDs must have the ULID shape before they go into any URL to Stoat,
 * so a crafted ID can't reach another internal route. Text is normalised and limited by visible characters.
 */
import { isUlid } from '@concord/domain';
import { LayerError } from './util.ts';

export function requireId(value: unknown, what = 'id'): string {
  if (!isUlid(value)) throw new LayerError(400, 'InvalidId', { field: what });
  return value;
}

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
/**
 * Control and format characters, which change direction or hide text, line and paragraph separators, and blanks
 * that look like nothing. The zero-width joiner and non-joiner stay, for emoji and scripts that need them.
 */
const UNWANTED = /(?![\u200C\u200D])[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\u034F\u115F\u1160\u2800\u3164\uFFA0]/u;
/** A visible character is at most this many UTF-16 units, far more than any real emoji sequence. */
const MAX_UNITS_PER_CHARACTER = 16;

/** Visible characters, as people count them: an emoji with its modifiers is one. */
export const visibleLength = (text: string) => [...graphemes.segment(text)].length;

/**
 * Normalised text: NFC, trimmed, at most `max` visible characters, with no control or hidden characters.
 * `min` 0 allows empty text.
 */
export function requireText(value: unknown, { max, min = 1, field = 'text' }: { max: number; min?: number; field?: string }): string {
  if (typeof value !== 'string') throw new LayerError(400, 'InvalidText', { field });
  // Before any work, so a large body can't make the segmenter build a million objects.
  if (value.length > max * MAX_UNITS_PER_CHARACTER) throw new LayerError(400, 'InvalidText', { field, min, max });
  const text = value.normalize('NFC').trim();
  const length = visibleLength(text);
  if (UNWANTED.test(text) || length < min || length > max) throw new LayerError(400, 'InvalidText', { field, min, max });
  return text;
}
