import type { WebFrameMain } from 'electron';

/**
 * m5-plan.md decision 3: every IPC handler first checks that the call came from the client's own main frame. A frame
 * that has navigated away or been destroyed (`senderFrame` null), a subframe, or another origin is refused.
 */
export function trustedSender(event: { senderFrame: Pick<WebFrameMain, 'parent' | 'origin'> | null }, origin: string): boolean {
  const frame = event.senderFrame;
  return frame !== null && frame.parent === null && frame.origin === origin;
}
