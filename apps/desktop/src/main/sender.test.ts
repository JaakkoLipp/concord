import { describe, expect, it } from 'vitest';
import { trustedSender } from './sender.ts';

const ORIGIN = 'https://concord.jaalip.com';
const main = { parent: null, origin: ORIGIN };

describe('trustedSender', () => {
  it("accepts the client's main frame", () => {
    expect(trustedSender({ senderFrame: main }, ORIGIN)).toBe(true);
  });
  it('refuses a frame that navigated away or was destroyed', () => {
    expect(trustedSender({ senderFrame: null }, ORIGIN)).toBe(false);
  });
  it('refuses a subframe, even of our own origin', () => {
    expect(trustedSender({ senderFrame: { parent: main as never, origin: ORIGIN } }, ORIGIN)).toBe(false);
  });
  it('refuses another origin, the offline page and an opaque origin', () => {
    for (const origin of ['https://example.com', 'https://concord.jaalip.com:8443', 'http://concord.jaalip.com', 'file://', 'null', '']) {
      expect(trustedSender({ senderFrame: { parent: null, origin } }, ORIGIN)).toBe(false);
    }
  });
});
