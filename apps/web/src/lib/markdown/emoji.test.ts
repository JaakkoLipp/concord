import { describe, expect, it } from 'vitest';
import { twemojiName } from './emoji.ts';

describe('Twemoji file names', () => {
  it('drops U+FE0F outside ZWJ sequences and keeps it inside, except for the eye in speech bubble', () => {
    expect(twemojiName('❤️')).toBe('2764');
    expect(twemojiName('🏳️‍🌈')).toBe('1f3f3-fe0f-200d-1f308');
    expect(twemojiName('👁️‍🗨️')).toBe('1f441-200d-1f5e8');
  });
});
