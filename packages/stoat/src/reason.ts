/**
 * The audit log's reason, sent as Stoat's `X-Audit-Log-Reason` header (m4.7-plan.md task 6). A header must be one line of
 * Latin-1, and Stoat may refuse anything past ASCII, so the text is one line with everything outside printable ASCII
 * percent-encoded, `%` itself included, and the audit log decodes it again: "Älä spämmää — kiitos" survives the trip.
 * The encoded header stops at about 2 KB, at a whole character, since a proxy may refuse a longer one and fail the action.
 * A reason that can't be encoded is left out rather than failing the action.
 */
const MAX_HEADER = 2_000;

export function reasonHeader(reason: string | undefined): Record<string, string> {
  const text = reason?.replace(/\s+/g, ' ').trim();
  if (!text) return {};
  try {
    let out = '';
    for (const c of text) {
      const part = /^[\x20-\x24\x26-\x7e]$/.test(c) ? c : encodeURIComponent(c);
      if (out.length + part.length > MAX_HEADER) break;
      out += part;
    }
    return out ? { 'X-Audit-Log-Reason': out } : {};
  } catch {
    // A lone surrogate, pasted in: send without a reason.
    return {};
  }
}

/**
 * A reason as Stoat stored it, decoded where Concord encoded it. Anyone else's stays as it was, and a broken `%XX`
 * sequence, such as one cut off by Stoat's own limit, keeps what decodes and leaves the rest as it was.
 */
export function decodeReason(stored: string): string {
  if (!/%[0-9A-Fa-f]{2}/.test(stored)) return stored;
  try {
    return decodeURIComponent(stored);
  } catch {
    // Decode each run of escapes on its own, so one bad run doesn't spoil the rest.
    return stored.replace(/(?:%[0-9A-Fa-f]{2})+/g, (run) => {
      try {
        return decodeURIComponent(run);
      } catch {
        // A cut UTF-8 sequence: decode the whole characters at its start.
        for (let end = run.length - 3; end > 0; end -= 3) {
          try { return decodeURIComponent(run.slice(0, end)) + run.slice(end); } catch { /* shorter */ }
        }
        return run;
      }
    });
  }
}
