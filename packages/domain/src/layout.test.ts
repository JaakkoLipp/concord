/** Sidebar ordering (m2c-plan.md task 3): moves step over hidden channels and keep every ID. */
import { describe, expect, it } from 'vitest';
import type { Category } from './entities.ts';
import { deleteCategory, moveCategory, moveChannel, moveChannelTo } from './layout.ts';

const cats = (): Category[] => [
  { id: 'a', title: 'A', channels: ['a1', 'hidden', 'a2'] },
  { id: 'b', title: 'B', channels: ['b1', 'b2'] },
];
const shown = (id: string) => id !== 'hidden';
const ids = (c: Category[] | null) => c?.map((x) => x.channels.join(','));

describe('layout', () => {
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
