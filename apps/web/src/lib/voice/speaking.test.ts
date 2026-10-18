import { describe, expect, it, vi } from 'vitest';
import { Speaking } from './speaking.ts';

describe('speaking indicator', () => {
  it('lights locally without a server event, keeps remote speakers, and ignores stale self updates', () => {
    const emit = vi.fn();
    const speaking = new Speaking(() => 'self', emit);
    speaking.speakers(['peer', 'self']);
    expect(emit).toHaveBeenLastCalledWith(['peer']);
    speaking.microphone(true, true, -30, 0);
    expect(emit).toHaveBeenLastCalledWith(['peer', 'self']);
    speaking.speakers(['peer']);
    expect(emit).toHaveBeenCalledTimes(2);
    speaking.microphone(false, true, -30, 33);
    expect(emit).toHaveBeenLastCalledWith(['peer']);
    speaking.speakers(['peer', 'self']);
    expect(emit).toHaveBeenCalledTimes(3);
  });

  it('ignores silence with PTT held, closes after a short tail and does not light through a closed gate', () => {
    const emit = vi.fn();
    const speaking = new Speaking(() => 'self', emit);
    speaking.microphone(true, true, -100, 0);
    speaking.microphone(true, false, -20, 33);
    expect(emit).not.toHaveBeenCalled();
    speaking.microphone(true, true, -20, 66);
    expect(emit).toHaveBeenLastCalledWith(['self']);
    speaking.microphone(true, true, -100, 165);
    expect(emit).toHaveBeenCalledTimes(1);
    speaking.microphone(true, true, -100, 198);
    expect(emit).toHaveBeenLastCalledWith([]);
  });
});
