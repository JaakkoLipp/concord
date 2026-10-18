/** Private notes (M4.8 task 13): the parse and its caps, and writes that change only the edited person's note. */
import { describe, expect, it, vi } from 'vitest';
import type { Backend } from './backend.ts';
import { NOTE_MAX, NOTES_KEPT, NOTES_KEY, applyNotes, parseNotes, writeNotes } from './notes.ts';
import { Session } from './session.svelte.ts';

type Stored = Record<string, { value: string }>;
const receive = (session: Session, values: Stored) =>
  (session as unknown as { settingsChanged(values: Stored): void }).settingsChanged(values);
const load = (session: Session) => (session as unknown as { loadSettings(): Promise<boolean> }).loadSettings();

async function fake(stored: () => Promise<Stored>) {
  const writes: Record<string, string>[] = [];
  const backend = { setSettings: async (s: Record<string, string>) => { writes.push(s); }, settings: stored } as unknown as Backend;
  const session = new Session(backend);
  await load(session);
  return { session, writes, written: () => parseNotes(writes.at(-1)?.[NOTES_KEY]) };
}

describe('parseNotes', () => {
  it('tolerates bad data and caps the notes', () => {
    expect(parseNotes(undefined)).toEqual({});
    expect(parseNotes('{oops')).toEqual({});
    expect(parseNotes(JSON.stringify({ notes: ['a'] }))).toEqual({});
    expect(parseNotes(JSON.stringify({ notes: { a: 'hi', b: 3, c: '  ' } }))).toEqual({ a: 'hi' });
    expect(parseNotes(JSON.stringify({ notes: { a: 'x'.repeat(NOTE_MAX + 10) } })).a).toHaveLength(NOTE_MAX);
    const many = Object.fromEntries(Array.from({ length: NOTES_KEPT + 5 }, (_, i) => [`U${i}`, 'n']));
    const kept = parseNotes(writeNotes(many));
    expect(Object.keys(kept)).toHaveLength(NOTES_KEPT);
    expect(kept.U0).toBeUndefined();
    expect(kept[`U${NOTES_KEPT + 4}`]).toBe('n');
  });

  it('applies edits, an empty one removing the note', () => {
    expect(applyNotes({ a: 'one', b: 'two' }, new Map([['a', ' '], ['c', ' three ']]))).toEqual({ b: 'two', c: 'three' });
  });
});

describe('setNote', () => {
  it('writes after a pause, merged into what another device stored meanwhile', async () => {
    vi.useFakeTimers();
    try {
      const { session, writes, written } = await fake(async () => ({ [NOTES_KEY]: { value: writeNotes({ a: 'from before' }) } }));
      expect(session.store.notes).toEqual({ a: 'from before' });
      const saved = session.setNote('b', 'mine');
      session.setNote('b', 'mine, edited').catch(() => {});
      receive(session, { [NOTES_KEY]: { value: writeNotes({ a: 'from before', c: 'other device' }) } });
      expect(session.store.notes).toEqual({ a: 'from before', c: 'other device', b: 'mine, edited' });
      expect(writes).toEqual([]);
      await vi.advanceTimersByTimeAsync(1_000);
      await saved;
      expect(writes).toHaveLength(1);
      expect(written()).toEqual({ a: 'from before', c: 'other device', b: 'mine, edited' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps a note over a fetch that started before it was written', async () => {
    vi.useFakeTimers();
    try {
      let answer: (s: Stored) => void = () => {};
      let slow = false;
      const old = (): Stored => ({ [NOTES_KEY]: { value: writeNotes({ a: 'old' }) } });
      const { session, written } = await fake(() => (slow ? new Promise((r) => (answer = r)) : Promise.resolve(old())));
      slow = true;
      await vi.advanceTimersByTimeAsync(10);
      const fetching = load(session);
      await vi.advanceTimersByTimeAsync(10);
      const saved = session.setNote('a', 'new');
      await vi.advanceTimersByTimeAsync(3_000);
      await saved;
      answer(old());
      await fetching;
      expect(session.store.notes).toEqual({ a: 'new' });
      const again = session.setNote('b', 'second');
      session.flushNotes();
      await again;
      expect(written()).toEqual({ a: 'new', b: 'second' });
    } finally {
      vi.useRealTimers();
    }
  });
});
