/**
 * Push-to-talk keys, for the call and the mic test: while the chosen key is held, the gate is open. Only
 * while the tab has focus, and the chain itself closes the gate on blur. Returns the function that stops.
 */
export function listenPushToTalk(code: string, set: (down: boolean) => void): () => void {
  const down = (e: KeyboardEvent) => { if (e.code === code && !e.repeat) set(true); };
  const up = (e: KeyboardEvent) => { if (e.code === code) set(false); };
  window.addEventListener('keydown', down, true);
  window.addEventListener('keyup', up, true);
  return () => {
    window.removeEventListener('keydown', down, true);
    window.removeEventListener('keyup', up, true);
    set(false);
  };
}
