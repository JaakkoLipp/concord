/** Media helpers: proxied external images, display sizes and thumbhash placeholders. */
import { thumbHashToDataURL } from 'thumbhash';

/** External media goes through Stoat's January proxy, so the CSP can stay same-origin. */
export const proxied = (url: string) => `/january/proxy?url=${encodeURIComponent(url)}`;

/** Scale a width and height to fit a box, never enlarging. */
export function fit(width: number, height: number, maxW: number, maxH: number): { width: number; height: number } {
  if (!width || !height) return { width: maxW, height: Math.round(maxW * 0.5625) };
  const s = Math.min(1, maxW / width, maxH / height);
  return { width: Math.max(1, Math.round(width * s)), height: Math.max(1, Math.round(height * s)) };
}

const cache = new Map<string, string>();
export function placeholder(thumbhash: number[] | undefined): string | undefined {
  if (!thumbhash?.length) return undefined;
  const key = thumbhash.join(',');
  let url = cache.get(key);
  if (!url) {
    try {
      url = thumbHashToDataURL(Uint8Array.from(thumbhash));
    } catch {
      return undefined;
    }
    cache.set(key, url);
  }
  return url;
}

export function fileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let u = 0;
  while (v >= 1000 && u < units.length - 1) { v /= 1000; u++; }
  return `${v < 10 && u ? v.toFixed(1) : Math.round(v)} ${units[u]}`;
}
