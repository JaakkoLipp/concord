import { describe, expect, it } from 'vitest';
import { TOKEN, byteLength, outgoing, serialise, tokenAt } from './text.ts';

const ID = '01M4RF77M9HN9B92743Q5SXBKF';

describe('composer text', () => {
  it('counts UTF-8 bytes, not characters', () => {
    expect(byteLength('a'.repeat(2000))).toBe(2000);
    expect(byteLength('ä'.repeat(1000))).toBe(2000);
    expect(byteLength('🇫🇮')).toBe(8);
  });

  it('serialises a mention to 29 bytes', () => {
    expect(byteLength(serialise.user(ID))).toBe(29);
    expect(byteLength(serialise.emoji(ID))).toBe(28);
  });

  it('finds every token kind in Stoat syntax', () => {
    const text = `${serialise.user(ID)} ${serialise.role(ID)} ${serialise.channel(ID)} ${serialise.emoji(ID)} <@notanid> :sauna:`;
    const found = [...text.matchAll(TOKEN)].map((m) => tokenAt(m));
    expect(found).toEqual([
      { kind: 'user', id: ID },
      { kind: 'role', id: ID },
      { kind: 'channel', id: ID },
      { kind: 'emoji', id: ID },
    ]);
  });

  it('trims what is sent, and blank text sends nothing', () => {
    expect(outgoing('\n  hei  \n')).toBe('hei');
    expect(outgoing(' \n\t ')).toBe('');
  });
});
