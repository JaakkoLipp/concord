/** Closed-form critically damped spring helpers, independent of the DOM and frame rate. */
export const SPRING_OMEGA = 12.75;

export interface SpringState {
  position: number;
  /** Position velocity, in pixels per second. */
  velocity: number;
}

/**
 * Evaluates a critically damped spring after elapsedMs. The returned velocity is the analytic derivative,
 * so callers can retarget from the exact position and velocity at any moment.
 */
export function springAt(
  start: SpringState,
  target: number,
  elapsedMs: number,
  omega = SPRING_OMEGA,
): SpringState {
  const t = Math.max(0, elapsedMs) / 1000;
  const offset = start.position - target;
  const coefficient = start.velocity + omega * offset;
  const decay = Math.exp(-omega * t);
  return {
    position: target + (offset + coefficient * t) * decay,
    velocity: (start.velocity - omega * coefficient * t) * decay,
  };
}

/** Whether a spring is close and slow enough to snap to its target. */
export function springSettled(state: SpringState, target: number): boolean {
  return Math.abs(state.position - target) < 0.5 && Math.abs(state.velocity) < 5;
}
