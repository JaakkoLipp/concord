import { describe, expect, it } from 'vitest';
import { reactionKey } from './data.ts';

describe('reaction keys', () => {
  it('reuses the key already on the message when only U+FE0F differs', () => {
    expect(reactionKey(['❤'], '❤️')).toBe('❤');
    expect(reactionKey(['❤️'], '❤')).toBe('❤️');
    expect(reactionKey(['👍'], '❤️')).toBe('❤️');
  });
});
