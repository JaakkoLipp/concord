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
/** Control characters, and the format characters that change direction or hide text. Joiners stay, for emoji. */
const UNWANTED = /[\p{Cc}​‎‏‪-‮⁠-⁤⁦-⁩﻿]/u;

/** Visible characters, as people count them: an emoji with its modifiers is one. */
export const visibleLength = (text: string) => [...graphemes.segment(text)].length;

/**
 * Normalised text: NFC, trimmed, at most `max` visible characters, with no control or hidden characters.
 * `min` 0 allows empty text.
 */
export function requireText(value: unknown, { max, min = 1, field = 'text' }: { max: number; min?: number; field?: string }): string {
  if (typeof value !== 'string') throw new LayerError(400, 'InvalidText', { field });
  const text = value.normalize('NFC').trim();
  const length = visibleLength(text);
  if (UNWANTED.test(text) || length < min || length > max) throw new LayerError(400, 'InvalidText', { field, min, max });
  return text;
}
