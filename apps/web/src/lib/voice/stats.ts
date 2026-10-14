/**
 * Ping and packet loss for the voice panel's tooltip (client.md section 10.7), read from WebRTC stats. Loss
 * counters are running totals, so loss is measured between two samples.
 */

export interface Sample {
  /** Round-trip time on the selected candidate pair, in ms. */
  rtt?: number;
  /** Packets lost and sent or received, as running totals. */
  lost: number;
  total: number;
}

type Stat = { type: string; [k: string]: unknown };

/** One sample from a sender's or a receiver's stats report. */
export function sample(report: Iterable<Stat>): Sample {
  const out: Sample = { lost: 0, total: 0 };
  for (const s of report) {
    if (s.type === 'candidate-pair' && (s.nominated || s.selected) && typeof s.currentRoundTripTime === 'number') {
      out.rtt = Math.round(s.currentRoundTripTime * 1000);
    } else if (s.type === 'remote-inbound-rtp' && typeof s.packetsLost === 'number') {
      // What the far end reports losing of what we send.
      out.lost += Math.max(0, s.packetsLost);
    } else if (s.type === 'outbound-rtp' && typeof s.packetsSent === 'number') {
      out.total += s.packetsSent;
    } else if (s.type === 'inbound-rtp' && typeof s.packetsLost === 'number' && typeof s.packetsReceived === 'number') {
      out.lost += Math.max(0, s.packetsLost);
      out.total += s.packetsReceived + Math.max(0, s.packetsLost);
    }
  }
  return out;
}

/** Loss between two samples, as a percentage, or undefined when nothing went through. */
export function lossBetween(before: Sample | undefined, after: Sample): number | undefined {
  const total = after.total - (before?.total ?? 0);
  if (total <= 0) return undefined;
  const lost = Math.max(0, after.lost - (before?.lost ?? 0));
  return Math.round((lost / total) * 1000) / 10;
}
