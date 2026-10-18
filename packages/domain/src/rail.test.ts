/** The rail's synced settings (M4.8 tasks 10a and 10b): Stoat's `ordering` merged, and `concord:folders` held. */
import { describe, expect, it, vi } from 'vitest';
import type { Backend } from './backend.ts';
import { FOLDERS_KEY, railItems } from './folders.ts';
import { Session } from './session.svelte.ts';

const receive = (session: Session, values: Record<string, { value: string }>) =>
  (session as unknown as { settingsChanged(values: Record<string, { value: string }>): void }).settingsChanged(values);

type Stored = Record<string, { value: string }>;
const load = (session: Session) => (session as unknown as { loadSettings(): Promise<boolean> }).loadSettings();

/** A session whose settings fetch answers with `stored` (or fails), loaded unless `loaded` is false. */
async function fake(opts: { stored?: () => Promise<Stored>; loaded?: boolean } = {}) {
  const writes: Record<string, string>[] = [];
  const backend = {
    setSettings: async (settings: Record<string, string>) => { writes.push(settings); },
    settings: opts.stored ?? (async () => ({})),
  } as unknown as Backend;
  const session = new Session(backend);
  if (opts.loaded !== false) await load(session);
  return { session, writes };
}

describe('server order', () => {
  it('writes into Stoat’s ordering JSON, keeping its other fields and servers not shown', async () => {
    const { session, writes } = await fake();
    receive(session, { ordering: { value: JSON.stringify({ servers: ['a', 'gone', 'b'], theirs: { x: 1 } }) } });
    await session.setServerOrder(['b', 'a']);
    expect(writes.map((w) => JSON.parse(w.ordering!) as unknown)).toEqual([{ servers: ['b', 'a', 'gone'], theirs: { x: 1 } }]);
    expect(session.store.settings.serverOrder).toEqual(['b', 'a', 'gone']);
  });

  it('keeps a local move over an older echo until the hold ends', async () => {
    vi.useFakeTimers();
    try {
      const { session } = await fake();
      receive(session, { ordering: { value: JSON.stringify({ servers: ['a', 'b'] }) } });
      await session.setServerOrder(['b', 'a']);
      receive(session, { ordering: { value: JSON.stringify({ servers: ['a', 'b'] }) } });
      expect(session.store.settings.serverOrder).toEqual(['b', 'a']);
      // After the hold, what Stoat last said wins: another device's newer write.
      await vi.advanceTimersByTimeAsync(1_700);
      expect(session.store.settings.serverOrder).toEqual(['a', 'b']);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('folders', () => {
  it('writes the folders and the order of their servers', async () => {
    const { session, writes } = await fake();
    const items = railItems(['a', 'b', 'c'], [{ id: 'F', name: 'Pelit', servers: ['c', 'a'] }]);
    await session.setRail(items);
    expect(writes).toContainEqual({ [FOLDERS_KEY]: JSON.stringify({ folders: [{ id: 'F', name: 'Pelit', servers: ['c', 'a'] }] }) });
    expect(writes.some((w) => w.ordering && (JSON.parse(w.ordering) as { servers: string[] }).servers.join() === 'c,a,b')).toBe(true);
    expect(session.store.folders).toEqual([{ id: 'F', name: 'Pelit', servers: ['c', 'a'] }]);
  });

  it('takes another device’s folders, but not an echo during our own write', async () => {
    vi.useFakeTimers();
    try {
      const { session } = await fake();
      receive(session, { [FOLDERS_KEY]: { value: JSON.stringify({ folders: [{ id: 'G', name: '', servers: ['a', 'b'] }] }) } });
      expect(session.store.folders.map((f) => f.id)).toEqual(['G']);
      await session.setRail(railItems(['a', 'b'], []));
      receive(session, { [FOLDERS_KEY]: { value: JSON.stringify({ folders: [{ id: 'G', name: '', servers: ['a', 'b'] }] }) } });
      expect(session.store.folders).toEqual([]);
      await vi.advanceTimersByTimeAsync(1_700);
      expect(session.store.folders.map((f) => f.id)).toEqual(['G']);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('settings fetched at cold start', () => {
  const folder = { id: 'F', name: 'Pelit', servers: ['a', 'b'] };
  const stored = (): Stored => ({
    ordering: { value: JSON.stringify({ servers: ['a', 'b', 'c'], theirs: 1 }) },
    [FOLDERS_KEY]: { value: JSON.stringify({ folders: [folder] }) },
  });

  it('refuses rail writes until a fetch has succeeded, so the stored folders are never replaced', async () => {
    let fail = true;
    const { session, writes } = await fake({ loaded: false, stored: async () => { if (fail) throw new Error('down'); return stored(); } });
    expect(await load(session)).toBe(false);
    await expect(session.setRail(railItems(['a', 'b', 'c'], [{ id: 'N', name: '', servers: ['b', 'c'] }]))).rejects.toThrow();
    await expect(session.setServerOrder(['c', 'b', 'a'])).rejects.toThrow();
    await expect(session.setIgnoreBroadMentions('a', true)).rejects.toThrow();
    expect(writes).toEqual([]);
    expect(session.store.folders).toEqual([]);
    fail = false;
    expect(await load(session)).toBe(true);
    expect(session.store.folders).toEqual([folder]);
    await session.setServerOrder(['c', 'a', 'b']);
    expect(writes.map((w) => JSON.parse(w.ordering!) as unknown)).toEqual([{ servers: ['c', 'a', 'b'], theirs: 1 }]);
  });

  it('keeps rail changes made after a slow fetch started, in the store and in what later writes merge into', async () => {
    vi.useFakeTimers();
    try {
      let answer: (s: Stored) => void = () => {};
      let slow = false;
      const { session, writes } = await fake({ stored: () => (slow ? new Promise((r) => (answer = r)) : Promise.resolve(stored())) });
      // A reconnect's fetch starts, the user moves things, and the old answer arrives after the hold.
      slow = true;
      await vi.advanceTimersByTimeAsync(10);
      const fetching = load(session);
      await vi.advanceTimersByTimeAsync(10);
      await session.setRail(railItems(['c', 'a', 'b'], []));
      await vi.advanceTimersByTimeAsync(1_700);
      answer(stored());
      await fetching;
      expect(session.store.folders).toEqual([]);
      expect(session.store.settings.serverOrder).toEqual(['c', 'a', 'b']);
      writes.length = 0;
      await session.setServerOrder(['c', 'b', 'a']);
      expect(writes.map((w) => JSON.parse(w.ordering!) as unknown)).toEqual([{ servers: ['c', 'b', 'a'], theirs: 1 }]);
    } finally {
      vi.useRealTimers();
    }
  });
});
