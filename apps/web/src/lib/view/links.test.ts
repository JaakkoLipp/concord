import { describe, expect, it } from 'vitest';
import { masked } from './links.ts';

describe('masked links', () => {
  it('lets a link through whose text is its own address', () => {
    expect(masked('https://example.com', 'https://example.com/')).toBe(false);
    expect(masked('example.com/sauna', 'https://www.example.com/sauna')).toBe(false);
    expect(masked('https://fi.wikipedia.org/wiki/Löyly', 'https://fi.wikipedia.org/wiki/L%C3%B6yly')).toBe(false);
  });

  it('asks when the text is anything else', () => {
    expect(masked('the rules', 'https://example.com/rules')).toBe(true);
    expect(masked('https://example.com', 'https://evil.example/')).toBe(true);
    expect(masked('', 'https://example.com')).toBe(true);
    expect(masked('example.com', 'not a url')).toBe(true);
  });
});
