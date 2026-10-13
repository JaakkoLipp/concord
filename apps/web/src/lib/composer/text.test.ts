import { describe, expect, it } from 'vitest';
import { TOKEN, activeQuery, byteLength, outgoing, serialise, tokenAt } from './text.ts';

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

describe('autocomplete queries', () => {
  it('finds the query the caret is in', () => {
    expect(activeQuery('hei @ai')).toEqual({ kind: '@', query: 'ai', start: 4 });
    expect(activeQuery('@')).toEqual({ kind: '@', query: '', start: 0 });
    expect(activeQuery('katso #yle')).toEqual({ kind: '#', query: 'yle', start: 6 });
    expect(activeQuery('moi :sa')).toEqual({ kind: ':', query: 'sa', start: 4 });
    expect(activeQuery('(@aino')).toEqual({ kind: '@', query: 'aino', start: 1 });
  });

  it('ignores what is not the start of a word, a lone colon, and finished tokens', () => {
    expect(activeQuery('email@host')).toBeNull();
    expect(activeQuery('klo 12:3')).toBeNull();
    expect(activeQuery('moi :s')).toBeNull();
    expect(activeQuery('@aino ')).toBeNull();
    expect(activeQuery(`<@${ID}>`)).toBeNull();
  });
});
