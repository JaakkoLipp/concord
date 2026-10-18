/**
 * The audit log's reason, sent as Stoat's `X-Audit-Log-Reason` header (m4.7-plan.md task 6). A header must be one line of
 * Latin-1, and Stoat may refuse anything past ASCII, so the text is one line with everything outside printable ASCII
 * percent-encoded, `%` itself included, and the audit log decodes it again: "Älä spämmää — kiitos" survives the trip.
 * A reason that can't be encoded is left out rather than failing the action.
 */
const MAX = 1024;

export function reasonHeader(reason: string | undefined): Record<string, string> {
  const text = reason?.replace(/\s+/g, ' ').trim().slice(0, MAX);
  if (!text) return {};
  try {
    return { 'X-Audit-Log-Reason': text.replace(/[^\x20-\x24\x26-\x7e]/gu, (c) => encodeURIComponent(c)) };
  } catch {
    // A lone surrogate, cut by the length limit or pasted in: send without a reason.
    return {};
  }
}

/** A reason as Stoat stored it, decoded where Concord encoded it. Anyone else's stays as it was. */
export function decodeReason(stored: string): string {
  if (!/%[0-9A-Fa-f]{2}/.test(stored)) return stored;
  try {
    return decodeURIComponent(stored);
  } catch {
    return stored;
  }
}
