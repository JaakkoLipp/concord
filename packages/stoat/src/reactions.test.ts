import { describe, expect, it } from 'vitest';
import { StoatBackend } from './backend.ts';
import type { Transport } from './transport.ts';

describe('reaction allowlist', () => {
  it('accepts what Stoat 0.15.5 accepted live, ignoring U+FE0F', async () => {
    const form = await new StoatBackend({} as Transport).reactionEmoji();
    for (const ok of ['🥹', '🫨', '🇫🇮', '01M4RFATPAWB74FX2WGMJR8X8A']) expect(form(ok), ok).toBe(ok);
    // One spelling whichever way the picker writes it.
    expect(form('👍️')).toBe(form('👍'));
    expect(form('❤')).toBe(form('❤️'));
    for (const no of ['abc', 'a', '']) expect(form(no), no).toBeNull();
  });
});
