import { describe, expect, it, vi } from 'vitest';
import type { Backend } from './backend.ts';
import { Session, parseSettings } from './session.svelte.ts';

const HIDDEN = 'concord:hiddenMutedChannels';
const receiveSettings = (session: Session, values: Record<string, { value: string }>) =>
  (session as unknown as { settingsChanged(values: Record<string, { value: string }>): void }).settingsChanged(values);

describe('hidden muted channel settings', () => {
  it('keeps only true server flags and treats malformed data as empty', () => {
    expect(parseSettings({ [HIDDEN]: { value: JSON.stringify({ s1: true, s2: false, s3: 1, s4: 'true' }) } }).hiddenMutedChannels)
      .toEqual({ s1: true });
    expect(parseSettings({ [HIDDEN]: { value: 'not json' } }).hiddenMutedChannels).toEqual({});
    expect(parseSettings({ [HIDDEN]: { value: '[true]' } }).hiddenMutedChannels).toEqual({});
  });

  it('serializes the per-server map while preserving other synced settings', async () => {
    const writes: Record<string, string>[] = [];
    const backend = { setSettings: async (settings: Record<string, string>) => { writes.push(settings); } } as unknown as Backend;
    const session = new Session(backend);
    receiveSettings(session, {
      notifications: { value: JSON.stringify({ server: { kept: 'all' } }) },
      [HIDDEN]: { value: JSON.stringify({ old: true }) },
    });

    await session.setHideMutedChannels('new', true);

    expect(writes).toEqual([{ [HIDDEN]: JSON.stringify({ old: true, new: true }) }]);
    expect(session.store.settings.hiddenMutedChannels).toEqual({ old: true, new: true });
    expect(session.store.settings.notifications.server).toEqual({ kept: 'all' });
  });

  it('restores the last synced map when a write fails', async () => {
    vi.useFakeTimers();
    const backend = { setSettings: vi.fn(async () => { throw new Error('offline'); }) } as unknown as Backend;
    const session = new Session(backend);
    receiveSettings(session, { [HIDDEN]: { value: JSON.stringify({ saved: true }) } });

    try {
      await expect(session.setHideMutedChannels('new', true)).rejects.toThrow('offline');
      expect(session.store.settings.hiddenMutedChannels).toEqual({ saved: true });
      await vi.advanceTimersByTimeAsync(1_600);
      expect(session.store.settings.hiddenMutedChannels).toEqual({ saved: true });
    } finally {
      vi.useRealTimers();
    }
  });
});
