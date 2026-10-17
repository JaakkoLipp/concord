/** Sidebar ordering (m2c-plan.md task 3): moves step over hidden channels and keep every ID. */
import { describe, expect, it } from 'vitest';
import type { Category } from './entities.ts';
import { dropChannel } from './layout.ts';
import { deleteCategory, moveCategory, moveChannel, moveChannelTo, moveServer, orderingFor, placeServer, railOrder, writeOrdering } from './layout.ts';

const cats = (): Category[] => [
  { id: 'a', title: 'A', channels: ['a1', 'hidden', 'a2'] },
  { id: 'b', title: 'B', channels: ['b1', 'b2'] },
];
const shown = (id: string) => id !== 'hidden';
const ids = (c: Category[] | null) => c?.map((x) => x.channels.join(','));

describe('layout', () => {
  it('drops beside a channel while preserving hidden IDs and the input', () => {
    const before = cats();
    expect(ids(dropChannel(before, 'a2', 'a', 'a1'))).toEqual(['a2,a1,hidden', 'b1,b2']);
    expect(ids(dropChannel(before, 'a1', 'b', 'b1', true))).toEqual(['hidden,a2', 'b1,a1,b2']);
    expect(before).toEqual(cats());
    expect(dropChannel(before, 'a1', 'a', 'a1')).toBeNull();
    expect(dropChannel(before, 'a1', 'missing')).toBeNull();
    expect(dropChannel(before, 'a1', 'b', 'gone')).toBeNull();
  });

  it('drops into empty categories and out into uncategorized channels', () => {
    expect(ids(dropChannel([...cats(), { id: 'empty', title: '', channels: [] }], 'a1', 'empty'))).toEqual(['hidden,a2', 'b1,b2', 'a1']);
    expect(ids(dropChannel(cats(), 'a1', null))).toEqual(['hidden,a2', 'b1,b2']);
    expect(ids(dropChannel(cats(), 'loose', 'b'))).toEqual(['a1,hidden,a2', 'b1,b2,loose']);
  });
  it('steps over channels this account can’t see, keeping them', () => {
    expect(ids(moveChannel(cats(), 'a2', -1, shown))).toEqual(['a2,a1,hidden', 'b1,b2']);
    expect(ids(moveChannel(cats(), 'a1', 1, shown))).toEqual(['hidden,a2,a1', 'b1,b2']);
  });

  it('crosses into the next or previous category at the edge', () => {
    expect(ids(moveChannel(cats(), 'a2', 1, shown))).toEqual(['a1,hidden', 'a2,b1,b2']);
    expect(ids(moveChannel(cats(), 'b1', -1, shown))).toEqual(['a1,hidden,a2,b1', 'b2']);
    expect(moveChannel(cats(), 'a1', -1, shown)).toBeNull();
    expect(moveChannel(cats(), 'b2', 1, shown)).toBeNull();
    expect(moveChannel(cats(), 'loose', 1, shown)).toBeNull();
  });

  it('moves a channel to a category or out of all of them', () => {
    expect(ids(moveChannelTo(cats(), 'a1', 'b'))).toEqual(['hidden,a2', 'b1,b2,a1']);
    expect(ids(moveChannelTo(cats(), 'a1', null))).toEqual(['hidden,a2', 'b1,b2']);
    expect(ids(moveChannelTo(cats(), 'new', 'a'))).toEqual(['a1,hidden,a2,new', 'b1,b2']);
  });

  it('reorders and deletes categories without losing channels elsewhere', () => {
    expect(moveCategory(cats(), 'b', -1)?.map((c) => c.id)).toEqual(['b', 'a']);
    expect(moveCategory(cats(), 'a', -1)).toBeNull();
    expect(ids(deleteCategory(cats(), 'a'))).toEqual(['b1,b2']);
  });

  it('never changes the list it was given', () => {
    const before = cats();
    moveChannel(before, 'a2', 1, shown);
    moveChannelTo(before, 'a1', 'b');
    expect(before).toEqual(cats());
  });
});

describe('server rail order', () => {
  it('takes the stored order for the servers present, then the rest by ID', () => {
    expect(railOrder(['c', 'gone', 'a', 'c'], ['a', 'b', 'c', 'd'])).toEqual(['c', 'a', 'b', 'd']);
    expect(railOrder([], ['b', 'a'])).toEqual(['a', 'b']);
  });

  it('moves a server one place, or to a position', () => {
    expect(moveServer(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveServer(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
    expect(moveServer(['a', 'b', 'c'], 'a', -1)).toBeNull();
    expect(moveServer(['a', 'b', 'c'], 'c', 1)).toBeNull();
    expect(placeServer(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b']);
    expect(placeServer(['a', 'b', 'c'], 'a', 9)).toEqual(['b', 'c', 'a']);
  });

  it('keeps stored servers that aren’t shown, after the shown ones', () => {
    expect(orderingFor(['b', 'a'], ['a', 'gone', 'b'])).toEqual(['b', 'a', 'gone']);
  });

  it('replaces only the servers in Stoat’s ordering JSON', () => {
    expect(JSON.parse(writeOrdering('{"servers":["a"],"other":{"x":1}}', ['b', 'a']))).toEqual({ servers: ['b', 'a'], other: { x: 1 } });
    expect(JSON.parse(writeOrdering(undefined, ['a']))).toEqual({ servers: ['a'] });
    expect(JSON.parse(writeOrdering('not json', ['a']))).toEqual({ servers: ['a'] });
    expect(JSON.parse(writeOrdering('[1]', ['a']))).toEqual({ servers: ['a'] });
  });
});
