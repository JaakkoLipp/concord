/**
 * Input for automatic idle (m2b-plan.md task 6). Every tab reports its input, shared with the other tabs of
 * this browser through localStorage, and only the tab holding a Web Lock runs the tracker, so three tabs
 * going away together make one change.
 */
import type { Session } from '@concord/domain';

const KEY = 'concord:lastInput';
const LOCK = 'concord:idle';
/** Input is counted at most once a second, and shared with other tabs at most every 10 s, except after quiet. */
const EVENT_EVERY_MS = 1_000;
const SHARE_EVERY_MS = 10_000;

export function watchIdle(session: Session): () => void {
  let lastEvent = 0;
  let lastShared = 0;
  let release: (() => void) | null = null;
  let stopped = false;

  const record = (at: number) => {
    session.idle.input(at);
    if (at - lastShared < SHARE_EVERY_MS) return;
    lastShared = at;
    try {
      localStorage.setItem(KEY, String(at));
    } catch {
      // Storage blocked: other tabs won't know, which only matters with several open.
    }
  };
  const onInput = () => {
    const now = Date.now();
    if (now - lastEvent < EVENT_EVERY_MS) return;
    lastEvent = now;
    record(now);
  };
  // Coming back to the window counts as input, so a laptop waking from sleep doesn't flash Idle.
  const onVisible = () => { if (document.visibilityState === 'visible') onInput(); };
  const onStorage = (e: StorageEvent) => { if (e.key === KEY && e.newValue) session.idle.input(Number(e.newValue)); };

  const events = ['keydown', 'pointerdown', 'pointermove', 'wheel', 'touchstart'] as const;
  for (const e of events) window.addEventListener(e, onInput, { passive: true, capture: true });
  window.addEventListener('focus', onInput);
  window.addEventListener('pageshow', onInput);
  window.addEventListener('storage', onStorage);
  document.addEventListener('visibilitychange', onVisible);

  if (navigator.locks) {
    void navigator.locks.request(LOCK, () => new Promise<void>((resolve) => {
      if (stopped) return resolve();
      release = resolve;
      session.idle.start();
    }));
  } else {
    session.idle.start();
  }

  return () => {
    stopped = true;
    for (const e of events) window.removeEventListener(e, onInput, { capture: true });
    window.removeEventListener('focus', onInput);
    window.removeEventListener('pageshow', onInput);
    window.removeEventListener('storage', onStorage);
    document.removeEventListener('visibilitychange', onVisible);
    session.idle.stop();
    release?.();
  };
}
