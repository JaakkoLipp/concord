import { describe, expect, it } from 'vitest';
import { GIFS_KEPT, parseFavouriteGifs } from './session.svelte.ts';

const gif = (n: number) => ({ url: `https://klipy.com/gifs/${n}`, src: `https://static.klipy.com/${n}.mp4`, video: true, width: 320, height: 180 });

describe('favourite GIFs', () => {
  it('reads what was saved', () => {
    expect(parseFavouriteGifs(JSON.stringify([gif(1), gif(2)]))).toEqual([gif(1), gif(2)]);
  });

  it('drops anything that isn’t a GIF with web addresses, and keeps the newest', () => {
    const junk = [{ ...gif(3), url: 'javascript:alert(1)' }, { ...gif(4), src: 5 }, 'x', null, { ...gif(5), width: 'wide' }, gif(6)];
    expect(parseFavouriteGifs(JSON.stringify(junk))).toEqual([gif(6)]);
    expect(parseFavouriteGifs('not json')).toEqual([]);
    expect(parseFavouriteGifs(JSON.stringify(Array.from({ length: GIFS_KEPT + 5 }, (_, i) => gif(i))))).toHaveLength(GIFS_KEPT);
  });
});
