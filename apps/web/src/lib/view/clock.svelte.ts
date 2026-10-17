/**
 * The time that permissions are worked out at (m4.7-plan.md task 5). A timeout's end changes them with nothing in
 * the store changing, so whatever reads a timed-out member's permissions through `permissionTime` is told again
 * the moment the timeout runs out: reactions, uploads and the composer come back together.
 */
let tick = $state(0);
const waking = new Set<number>();
/** setTimeout's longest wait. A longer timeout is woken early and simply asks again. */
const MAX_WAIT = 2 ** 31 - 1;

/** Now, as a reactive read that changes when `until` passes. `until` is a member's timeout, if any. */
export function permissionTime(until: string | undefined): Date {
  void tick;
  const now = new Date();
  const end = until ? Date.parse(until) : NaN;
  if (end > now.getTime() && !waking.has(end)) {
    waking.add(end);
    setTimeout(() => { waking.delete(end); tick++; }, Math.min(end - now.getTime() + 50, MAX_WAIT));
  }
  return now;
}
