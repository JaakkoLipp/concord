/** The rail's synced settings (M4.8 tasks 10a and 10b): Stoat's `ordering` merged, and `concord:folders` held. */
import { describe, expect, it, vi } from 'vitest';
import type { Backend } from './backend.ts';
import { FOLDERS_KEY, railItems } from './folders.ts';
import { Session } from './session.svelte.ts';

const receive = (session: Session, values: Record<string, { value: string }>) =>
  (session as unknown as { settingsChanged(values: Record<string, { value: string }>): void }).settingsChanged(values);

function fake() {
  const writes: Record<string, string>[] = [];
  const backend = { setSettings: async (settings: Record<string, string>) => { writes.push(settings); } } as unknown as Backend;
  return { session: new Session(backend), writes };
}

describe('server order', () => {
  it('writes into Stoat’s ordering JSON, keeping its other fields and servers not shown', async () => {
    const { session, writes } = fake();
    receive(session, { ordering: { value: JSON.stringify({ servers: ['a', 'gone', 'b'], theirs: { x: 1 } }) } });
    await session.setServerOrder(['b', 'a']);
    expect(writes.map((w) => JSON.parse(w.ordering!) as unknown)).toEqual([{ servers: ['b', 'a', 'gone'], theirs: { x: 1 } }]);
    expect(session.store.settings.serverOrder).toEqual(['b', 'a', 'gone']);
  });

  it('keeps a local move over an older echo until the hold ends', async () => {
    vi.useFakeTimers();
    try {
      const { session } = fake();
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
    const { session, writes } = fake();
    const items = railItems(['a', 'b', 'c'], [{ id: 'F', name: 'Pelit', servers: ['c', 'a'] }]);
    await session.setRail(items);
    expect(writes).toContainEqual({ [FOLDERS_KEY]: JSON.stringify({ folders: [{ id: 'F', name: 'Pelit', servers: ['c', 'a'] }] }) });
    expect(writes.some((w) => w.ordering && (JSON.parse(w.ordering) as { servers: string[] }).servers.join() === 'c,a,b')).toBe(true);
    expect(session.store.folders).toEqual([{ id: 'F', name: 'Pelit', servers: ['c', 'a'] }]);
  });

  it('takes another device’s folders, but not an echo during our own write', async () => {
    vi.useFakeTimers();
    try {
      const { session } = fake();
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
