import { describe, expect, it } from 'vitest';
import { MAX_ROWS, results, type Place } from './switcherResults.ts';

const places: Place[] = [
  { kind: 'channel', id: 'c-general', label: 'general', detail: 'Concord', server: 's-1' },
  { kind: 'channel', id: 'c-offtopic', label: 'off-topic', detail: 'Concord', server: 's-1' },
  { kind: 'voice', id: 'c-lobby', label: 'lobby', detail: 'Pelit', server: 's-2' },
  { kind: 'server', id: 's-2', label: 'General Club' },
  { kind: 'dm', id: 'd-aino', label: 'Aino Virtanen' },
  { kind: 'person', id: 'u-emma', label: 'Emma Walsh', detail: 'emma.w' },
];

describe('quick switcher rows', () => {
  it('labels channels with a #, voice channels too, and keeps the other kinds as they are', () => {
    const rows = results('', places, ['c-general', 'c-lobby', 'd-aino']);
    expect(rows.map((r) => r.title)).toEqual(['#general', '#lobby', 'Aino Virtanen']);
    expect(results('club', places, [])[0]).toMatchObject({ kind: 'server', title: 'General Club' });
  });

  it('lists the recent places first, newest first, and only those still there', () => {
    const rows = results('', places, ['d-gone', 'c-offtopic', 'u-emma', 'c-general']);
    expect(rows.map((r) => r.id)).toEqual(['c-offtopic', 'c-general']);
  });

  it('shows nothing for an empty query with no recent places', () => {
    expect(results('  ', places, [])).toEqual([]);
  });

  it('matches every kind with the same ranking, ignoring case and surrounding spaces', () => {
    const rows = results('  GEN ', places, []);
    expect(rows.map((r) => r.id)).toEqual(['c-general', 's-2']);
    expect(rows.map((r) => r.kind)).toEqual(['channel', 'server']);
  });

  it('matches a person by username as well as display name', () => {
    expect(results('emma.w', places, []).map((r) => r.id)).toEqual(['u-emma']);
    expect(results('walsh', places, []).map((r) => r.id)).toEqual(['u-emma']);
  });

  it('ranks a match at the start of a name above one at the start of a word', () => {
    const pool: Place[] = [
      { kind: 'channel', id: 'word', label: 'lobby-vir' },
      { kind: 'channel', id: 'start', label: 'virtual' },
    ];
    expect(results('vir', pool, []).map((r) => r.id)).toEqual(['start', 'word']);
  });

  it('offers at most MAX_ROWS rows', () => {
    const many: Place[] = Array.from({ length: MAX_ROWS + 5 }, (_, i) => ({ kind: 'channel' as const, id: `c-${i}`, label: `chan-${i}` }));
    expect(results('chan', many, [])).toHaveLength(MAX_ROWS);
  });

  it('offers no channel the account cannot view, because it is not in the places it is given', () => {
    const visible = places.filter((p) => p.id !== 'c-offtopic');
    expect(results('off', visible, ['c-offtopic'])).toEqual([]);
  });
});
