import { describe, expect, it } from 'vitest';
import { isVoiceMessage, voiceFileName } from './voiceMessage.ts';

describe('voice message names', () => {
  it('names a clip by its local start time, and knows it again', () => {
    const name = voiceFileName(new Date(2026, 9, 18, 14, 2, 33), 'webm');
    expect(name).toBe('voice-message-20261018-140233.webm');
    expect(isVoiceMessage(name)).toBe(true);
    expect(isVoiceMessage('voice-message-20261018-140233.ogg')).toBe(true);
  });

  it('leaves other files alone', () => {
    expect(isVoiceMessage('voice-message-notes.txt')).toBe(false);
    expect(isVoiceMessage('my voice-message-1.ogg')).toBe(false);
    expect(isVoiceMessage('song.ogg')).toBe(false);
  });
});
