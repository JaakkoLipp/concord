/**
 * Private notes on people (M4.8 task 13), synced as `concord:notes`: `{notes: {user: text}}`. Stoat has no
 * route for notes, so they live in this account's settings, visible only to it.
 */
import type { Id } from './entities.ts';

export const NOTES_KEY = 'concord:notes';
/** Characters in one note, as on Discord. */
export const NOTE_MAX = 256;
/** Notes kept; past this the ones edited longest ago go first. */
export const NOTES_KEPT = 500;

/** Bad data gives no notes; a note is a non-empty string, cut to its cap, and only the newest are kept. */
export function parseNotes(raw: string | undefined): Record<Id, string> {
  if (!raw) return {};
  try {
    const notes = (JSON.parse(raw) as { notes?: unknown }).notes;
    if (!notes || typeof notes !== 'object' || Array.isArray(notes)) return {};
    const kept = Object.entries(notes).filter((e): e is [string, string] => typeof e[1] === 'string' && !!e[1].trim() && e[0].length <= 64);
    return Object.fromEntries(kept.slice(-NOTES_KEPT).map(([user, text]) => [user, text.slice(0, NOTE_MAX)]));
  } catch {
    return {};
  }
}

/**
 * Edits on top of stored notes, an empty text removing the note. An edited note moves to the end, so the cap
 * drops the ones edited longest ago. Each edit changes only its own person, so another device's notes survive.
 */
export function applyNotes(stored: Record<Id, string>, edits: ReadonlyMap<Id, string>): Record<Id, string> {
  const next = { ...stored };
  for (const [user, text] of edits) {
    delete next[user];
    const t = text.trim().slice(0, NOTE_MAX);
    if (t) next[user] = t;
  }
  return Object.fromEntries(Object.entries(next).slice(-NOTES_KEPT));
}

export const writeNotes = (notes: Record<Id, string>): string => JSON.stringify({ notes });
