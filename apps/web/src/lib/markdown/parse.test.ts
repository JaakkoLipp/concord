import { describe, expect, it } from 'vitest';
import { inline, onlyEmoji, parse, type Inline } from './parse.ts';

const U = '01KE6P5328000005FDJX3VMBAG';
const text = (v: string): Inline => ({ t: 'text', v });

describe('inline', () => {
  it('parses emphasis, strong, both, strikethrough and spoilers', () => {
    expect(inline('**b** *i* ***bi*** ~~s~~ ||x||')).toEqual([
      { t: 'strong', c: [text('b')] }, text(' '), { t: 'em', c: [text('i')] }, text(' '),
      { t: 'strong', c: [{ t: 'em', c: [text('bi')] }] }, text(' '), { t: 'strike', c: [text('s')] }, text(' '),
      { t: 'spoiler', c: [text('x')] },
    ]);
  });
  it('nests spoilers and emphasis', () => {
    expect(inline('||a **b** ||c|| d||')).toEqual([
      { t: 'spoiler', c: [text('a '), { t: 'strong', c: [text('b')] }, text(' ')] }, text('c'), { t: 'spoiler', c: [text(' d')] },
    ]);
    expect(inline('**a *b* c**')).toEqual([{ t: 'strong', c: [text('a '), { t: 'em', c: [text('b')] }, text(' c')] }]);
  });
  it('leaves snake_case and lone delimiters alone', () => {
    expect(inline('snake_case_name and 2 * 3 * 4')).toEqual([text('snake_case_name and 2 * 3 * 4')]);
  });
  it('keeps mention syntax inside code spans literal', () => {
    expect(inline(`\`<@${U}>\` and \`@everyone\``)).toEqual([{ t: 'code', v: `<@${U}>` }, text(' and '), { t: 'code', v: '@everyone' }]);
  });
  it('parses user, role and channel mentions, custom emoji and mass mentions', () => {
    expect(inline(`<@${U}> <%${U}> <#${U}> :${U}: @everyone`)).toEqual([
      { t: 'user', id: U }, text(' '), { t: 'role', id: U }, text(' '), { t: 'channel', id: U }, text(' '), { t: 'emoji', id: U }, text(' '), { t: 'mass', v: 'everyone' },
    ]);
    expect(inline('mail@everyone.fi')).toEqual([text('mail@everyone.fi')]);
  });
  it('parses timestamps with every style and defaults to f', () => {
    expect(inline('<t:1791763200:R> <t:1791763200>')).toEqual([{ t: 'time', unix: 1791763200, style: 'R' }, text(' '), { t: 'time', unix: 1791763200, style: 'f' }]);
  });
  it('links http and https only', () => {
    expect(inline('[a](https://x.fi/p) [b](javascript:alert(1))')).toEqual([
      { t: 'link', href: 'https://x.fi/p', c: [text('a')] }, text(' [b](javascript:alert(1))'),
    ]);
    expect(inline('see https://example.org/a_b.')).toEqual([text('see '), { t: 'link', href: 'https://example.org/a_b', c: [text('https://example.org/a_b')] }, text('.')]);
  });
  it('honours escapes', () => {
    expect(inline('\\*not italic\\* and \\`not code\\`')).toEqual([text('*not italic* and `not code`')]);
  });
  it('turns single newlines into breaks', () => {
    expect(inline('a\nb')).toEqual([text('a'), { t: 'br' }, text('b')]);
  });
  it('splits unicode emoji out of text, keycaps and flags included', () => {
    expect(inline('hei 🇫🇮 ja 👍🏽 1️⃣ 2')).toEqual([text('hei '), { t: 'unicode', v: '🇫🇮' }, text(' ja '), { t: 'unicode', v: '👍🏽' }, text(' '), { t: 'unicode', v: '1️⃣' }, text(' 2')]);
  });
  it('parses inline math', () => {
    expect(inline('x $$e^{i\\pi}$$ y')).toEqual([text('x '), { t: 'math', v: 'e^{i\\pi}' }, text(' y')]);
  });
});

describe('blocks', () => {
  it('parses headings, quotes, rules and fenced code with a language', () => {
    expect(parse('# H1\n## H2\n> quote\n> two\n\n---\n\n```rust\nfn main() {}\n```')).toEqual([
      { t: 'h', level: 1, c: [text('H1')] },
      { t: 'h', level: 2, c: [text('H2')] },
      { t: 'quote', c: [{ t: 'p', c: [text('quote'), { t: 'br' }, text('two')] }] },
      { t: 'hr' },
      { t: 'code', lang: 'rust', v: 'fn main() {}' },
    ]);
  });
  it('parses nested lists and ordered lists', () => {
    expect(parse('- a\n- b\n  - c\n\n1. one\n2. two')).toEqual([
      { t: 'list', ordered: false, start: 1, items: [[{ t: 'p', c: [text('a')] }], [{ t: 'p', c: [text('b')] }, { t: 'list', ordered: false, start: 1, items: [[{ t: 'p', c: [text('c')] }]] }]] },
      { t: 'list', ordered: true, start: 1, items: [[{ t: 'p', c: [text('one')] }], [{ t: 'p', c: [text('two')] }]] },
    ]);
  });
  it('parses tables with alignment', () => {
    expect(parse('| Peli | Pelaajia |\n|---|---:|\n| Minecraft | 12 |')).toEqual([
      { t: 'table', align: [null, 'right'], head: [[text('Peli')], [text('Pelaajia')]], rows: [[[text('Minecraft')], [text('12')]]] },
    ]);
  });
  it('keeps mention syntax literal inside fenced code', () => {
    expect(parse(`\`\`\`\n<@${U}> @everyone\n\`\`\``)).toEqual([{ t: 'code', lang: '', v: `<@${U}> @everyone` }]);
  });
  it('parses block math', () => {
    expect(parse('$$\nx^2\n$$')).toEqual([{ t: 'math', v: 'x^2' }]);
  });
  it('recognises emoji-only messages', () => {
    expect(onlyEmoji(parse('🔥 🔥'))).toBe(true);
    expect(onlyEmoji(parse(`:${U}:`))).toBe(true);
    expect(onlyEmoji(parse('hot 🔥'))).toBe(false);
  });
  it('parses the seeded markdown showcase messages without losing text', () => {
    const showcase = [
      '# Markdown test 1\n\n**bold**, *italic*, ***both***, ~~strikethrough~~, `inline code`, ||spoiler||, and a\nsingle newline line break.\n\n> A quote\n> over two lines\n\n- list item\n- another\n  - nested\n\n1. first\n2. second',
      `User <@${U}>, role <%${U}>, channel <#${U}>, custom emoji :${U}: and unicode 🇫🇮.\n\n| Peli | Pelaajia |\n|---|---:|\n| Minecraft | 12 |\n\nMath: $$e^{i\\pi} + 1 = 0$$\n\n---\n\nMass mention in a code span: \`@everyone\``,
    ];
    const kinds = new Set<string>();
    const walk = (n: unknown): void => {
      if (Array.isArray(n)) return n.forEach(walk);
      if (n && typeof n === 'object') {
        kinds.add((n as { t: string }).t);
        Object.values(n).forEach(walk);
      }
    };
    walk(showcase.map(parse));
    for (const k of ['h', 'strong', 'em', 'strike', 'code', 'spoiler', 'br', 'quote', 'list', 'user', 'role', 'channel', 'emoji', 'unicode', 'table', 'math', 'hr']) {
      expect(kinds, k).toContain(k);
    }
  });
});
