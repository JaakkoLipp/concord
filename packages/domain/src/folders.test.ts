/** Server folders (M4.8 task 10b): reading them, the rail they make, and every edit, including the dissolve rule. */
import { describe, expect, it } from 'vitest';
import { dropInGap, dropOnto, flatten, foldersOf, makeFolder, moveOnRail, parseFolders, railItems, removeFolder, removeFromFolder, renameFolder, type RailItem } from './folders.ts';

/** A rail as text: servers by ID, a folder as `id[a,b]`. */
const show = (items: RailItem[] | null) => items?.map((i) => (i.kind === 'server' ? i.id : `${i.folder.id}[${i.folder.servers.join(',')}]`)).join(' ');
const rail = (order: string[], folders: { id: string; servers: string[] }[]) => railItems(order, folders.map((f) => ({ name: '', ...f })));

describe('parseFolders', () => {
  it('drops bad data, keeps a server in one folder only, and caps names', () => {
    expect(parseFolders(undefined)).toEqual([]);
    expect(parseFolders('nope')).toEqual([]);
    expect(parseFolders('{"folders":{}}')).toEqual([]);
    const raw = JSON.stringify({ folders: [
      { id: 'f1', name: 'x'.repeat(50), color: '#ABCDEF', servers: ['a', 'b', 3, 'a'] },
      { id: 'f1', name: 'again', servers: ['c'] },
      { id: 'bad id!', servers: ['d'] },
      { id: 'f2', name: 7, color: 'red', servers: ['b', 'c'] },
      null,
      { id: 'f3' },
    ] });
    expect(parseFolders(raw)).toEqual([
      { id: 'f1', name: 'x'.repeat(32), color: '#ABCDEF', servers: ['a', 'b'] },
      { id: 'f2', name: '', servers: ['c'] },
    ]);
  });
});

describe('railItems', () => {
  it('puts a folder at its first server’s place, with its own order inside', () => {
    expect(show(rail(['a', 'b', 'c', 'd'], [{ id: 'F', servers: ['d', 'b'] }]))).toBe('a F[d,b] c');
  });

  it('drops servers the account left, and dissolves a folder left with one', () => {
    expect(show(rail(['a', 'b', 'c'], [{ id: 'F', servers: ['b', 'gone'] }, { id: 'G', servers: ['a', 'c', 'gone'] }]))).toBe('G[a,c] b');
  });

  it('flattens to the order Stoat stores, each folder’s servers together', () => {
    const items = rail(['a', 'b', 'c', 'd'], [{ id: 'F', servers: ['d', 'b'] }]);
    expect(flatten(items)).toEqual(['a', 'd', 'b', 'c']);
    expect(foldersOf(items).map((f) => f.servers)).toEqual([['d', 'b']]);
  });
});

describe('edits', () => {
  const base = () => rail(['a', 'b', 'c', 'd', 'e'], [{ id: 'F', servers: ['b', 'c'] }]);
  // As shown: a F[b,c] d e

  it('reorders on the rail, and moves a whole folder', () => {
    expect(show(dropInGap(base(), { kind: 'server', id: 'e' }, { folder: null, at: 0 }))).toBe('e a F[b,c] d');
    expect(show(dropInGap(base(), { kind: 'folder', id: 'F' }, { folder: null, at: 3 }))).toBe('a d e F[b,c]');
    expect(show(dropInGap(base(), { kind: 'folder', id: 'F' }, { folder: 'F', at: 0 }))).toBe('a F[b,c] d e');
  });

  it('moves a server into a folder at a place, or out of it onto the rail', () => {
    expect(show(dropInGap(base(), { kind: 'server', id: 'e' }, { folder: 'F', at: 1 }))).toBe('a F[b,e,c] d');
    expect(show(dropInGap(base(), { kind: 'server', id: 'c' }, { folder: 'F', at: 0 }))).toBe('a F[c,b] d e');
  });

  it('dissolves a folder its second-to-last server leaves', () => {
    expect(show(dropInGap(base(), { kind: 'server', id: 'b' }, { folder: null, at: 4 }))).toBe('a c d e b');
    expect(show(removeFromFolder(base(), 'b'))).toBe('a c b d e');
  });

  it('makes a folder by dropping a server on another, or joins a folder', () => {
    expect(show(dropOnto(base(), 'e', { kind: 'server', id: 'a' }, 'N'))).toBe('N[a,e] F[b,c] d');
    expect(show(dropOnto(base(), 'e', { kind: 'folder', id: 'F' }, 'N'))).toBe('a F[b,c,e] d');
    expect(show(dropOnto(base(), 'e', { kind: 'server', id: 'c' }, 'N'))).toBe('a F[b,c,e] d');
    expect(show(dropOnto(base(), 'a', { kind: 'server', id: 'a' }, 'N'))).toBe('a F[b,c] d e');
    // Taking one of a folder's two servers onto a third dissolves the old folder.
    expect(show(dropOnto(base(), 'c', { kind: 'server', id: 'e' }, 'N'))).toBe('a b d N[e,c]');
  });

  it('makes a folder from the menu at the first chosen server’s place', () => {
    expect(show(makeFolder(base(), ['e', 'a'], 'N', ' Pelit '))).toBe('N[a,e] F[b,c] d');
    expect(makeFolder(base(), ['e', 'a'], 'N', ' Pelit ')[0]).toMatchObject({ folder: { name: 'Pelit' } });
    // Taking a folder's servers dissolves it; one server makes no folder.
    expect(show(makeFolder(base(), ['c', 'd'], 'N', ''))).toBe('a N[c,d] b e');
    expect(show(makeFolder(base(), ['d'], 'N', ''))).toBe('a F[b,c] d e');
  });

  it('removes and renames a folder', () => {
    expect(show(removeFolder(base(), 'F'))).toBe('a b c d e');
    expect(renameFolder(base(), 'F', '  Työ ')[1]).toMatchObject({ folder: { name: 'Työ' } });
  });

  it('moves up and down on the rail, and within a folder', () => {
    expect(show(moveOnRail(base(), { kind: 'server', id: 'd' }, -1))).toBe('a d F[b,c] e');
    expect(show(moveOnRail(base(), { kind: 'folder', id: 'F' }, 1))).toBe('a d F[b,c] e');
    expect(show(moveOnRail(base(), { kind: 'server', id: 'b' }, 1))).toBe('a F[c,b] d e');
    expect(moveOnRail(base(), { kind: 'server', id: 'b' }, -1)).toBeNull();
    expect(moveOnRail(base(), { kind: 'server', id: 'a' }, -1)).toBeNull();
    expect(moveOnRail(base(), { kind: 'server', id: 'e' }, 1)).toBeNull();
  });

  it('never changes the rail it was given', () => {
    const items = base();
    const before = show(items);
    dropInGap(items, { kind: 'server', id: 'b' }, { folder: null, at: 0 });
    dropOnto(items, 'c', { kind: 'server', id: 'e' }, 'N');
    makeFolder(items, ['b', 'd'], 'N', '');
    expect(show(items)).toBe(before);
  });
});
