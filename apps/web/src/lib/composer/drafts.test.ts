import { describe, expect, it } from 'vitest';
import { DRAFT_CHARS, DRAFTS_MAX, capDrafts, mergeDrafts, parseDrafts, type Draft } from './drafts.ts';

const d = (text: string, at: number, caret = text.length): Draft => ({ text, caret, at });

describe('parseDrafts', () => {
  it('drops malformed entries and anything that is not an object', () => {
    expect(parseDrafts(null)).toEqual({});
    expect(parseDrafts([d('a', 1)])).toEqual({});
    expect(parseDrafts({ 'u:a': d('hi', 1), 'u:b': { text: 5, caret: 0, at: 1 }, 'u:c': d('', 1), 'u:d': 'x' })).toEqual({ 'u:a': d('hi', 1) });
  });

  it('caps the text of a draft and its caret', () => {
    const long = 'x'.repeat(DRAFT_CHARS + 10);
    expect(parseDrafts({ 'u:a': d(long, 1) })['u:a']).toEqual({ text: long.slice(0, DRAFT_CHARS), caret: DRAFT_CHARS, at: 1 });
  });
});

describe('capDrafts', () => {
  it('keeps the newest drafts', () => {
    const all = Object.fromEntries(Array.from({ length: DRAFTS_MAX + 5 }, (_, i) => [`u:${i}`, d('t', i)]));
    const kept = capDrafts(all);
    expect(Object.keys(kept)).toHaveLength(DRAFTS_MAX);
    expect(kept['u:4']).toBeUndefined();
    expect(kept['u:5']).toBeDefined();
  });
});

describe('mergeDrafts', () => {
  it("lays this tab's changes over the stored drafts and keeps another tab's", () => {
    const stored = { 'u:a': d('other tab', 1), 'u:b': d('old', 1), 'u:c': d('sent', 1) };
    const local = new Map([['u:b', d('new', 2)], ['u:z', d('untouched here', 2)]]);
    expect(mergeDrafts(stored, local, new Set(['u:b', 'u:c']))).toEqual({ 'u:a': d('other tab', 1), 'u:b': d('new', 2) });
  });
});
