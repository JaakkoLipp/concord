/** The audit log reason header must never make a moderation request throw (m4.7-plan.md task 6). */
import { describe, expect, it } from 'vitest';
import { decodeReason, reasonHeader } from './reason.ts';

const header = (reason?: string) => reasonHeader(reason)['X-Audit-Log-Reason'];

describe('reasonHeader', () => {
  it('is left out when there is no reason', () => {
    expect(reasonHeader(undefined)).toEqual({});
    expect(reasonHeader('  \n ')).toEqual({});
  });

  it('is one line of printable ASCII, which a browser accepts as a header value', () => {
    for (const reason of ['Älä spämmää — kiitos', '“quoted” €5 🙂', 'line one\nline two\ttabbed', '100% sure']) {
      const value = header(reason)!;
      expect(value).toMatch(/^[\x20-\x7e]+$/);
      expect(() => new Headers({ 'X-Audit-Log-Reason': value })).not.toThrow();
    }
  });

  it('decodes back to the text, on one line', () => {
    expect(decodeReason(header('Älä spämmää — kiitos')!)).toBe('Älä spämmää — kiitos');
    expect(decodeReason(header('100% sure\n🙂')!)).toBe('100% sure 🙂');
    expect(header('plain reason')).toBe('plain reason');
  });

  it('stops at about 2 KB encoded, at a whole character', () => {
    const value = header('漢'.repeat(1_000))!;
    expect(value.length).toBeLessThanOrEqual(2_000);
    expect(value.length % 9).toBe(0);
    expect(decodeReason(value)).toBe('漢'.repeat(value.length / 9));
  });

  it('decodes what it can of a cut sequence', () => {
    expect(decodeReason('%C3%84l%C3%A4 %E2%80')).toBe('Älä %E2%80');
    expect(decodeReason('%C3%84%E2%80')).toBe('Ä%E2%80');
  });

  it('leaves out a reason it can’t encode rather than throwing', () => {
    expect(reasonHeader('broken \ud800')).toEqual({});
  });

  it('keeps reasons from other clients as they were', () => {
    expect(decodeReason('rule 3')).toBe('rule 3');
    expect(decodeReason('50%off')).toBe('50%off');
  });
});
