import { crc32, deflateSync } from 'node:zlib';
import type { Rng } from './rng.ts';

type Rgba = [number, number, number, number];

/** Encode RGBA pixels as a PNG. */
export function encodePng(width: number, height: number, pixel: (x: number, y: number) => Rgba): Uint8Array {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixel(x, y);
      const i = row + 1 + x * 4;
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; raw[i + 3] = a;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function hsl(h: number, s: number, l: number): Rgba {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return [f(0), f(8), f(4), 255];
}

const mix = (a: Rgba, b: Rgba, t: number): Rgba => [0, 1, 2, 3].map((i) => Math.round(a[i]! + (b[i]! - a[i]!) * t)) as Rgba;

/** A symmetric 5 by 5 identicon on a coloured background, for avatars. */
export function identicon(rng: Rng, size = 256): Uint8Array {
  const hue = rng.int(0, 360);
  const fg = hsl(hue, 0.65, 0.6);
  const bg = hsl((hue + 180) % 360, 0.25, 0.18);
  const cells = Array.from({ length: 5 }, () => Array.from({ length: 3 }, () => rng.next() < 0.5));
  const cell = size / 6;
  return encodePng(size, size, (x, y) => {
    const cx = Math.floor(x / cell - 0.5);
    const cy = Math.floor(y / cell - 0.5);
    if (cx < 0 || cy < 0 || cx > 4 || cy > 4) return bg;
    return cells[cy]![cx < 3 ? cx : 4 - cx] ? fg : bg;
  });
}

/** A diagonal two-colour gradient, for profile and server banners. */
export function gradient(rng: Rng, width: number, height: number): Uint8Array {
  const a = hsl(rng.int(0, 360), 0.6, 0.45);
  const b = hsl(rng.int(0, 360), 0.6, 0.3);
  return encodePng(width, height, (x, y) => mix(a, b, (x / width + y / height) / 2));
}

const SHAPES = ['circle', 'ring', 'square', 'diamond', 'triangle', 'star', 'plus', 'heart'] as const;

/** A transparent-background shape, for custom emoji. */
export function emojiShape(rng: Rng, index: number, size = 128): Uint8Array {
  const shape = SHAPES[index % SHAPES.length]!;
  const colour = hsl((index * 47 + rng.int(0, 30)) % 360, 0.75, 0.55);
  const clear: Rgba = [0, 0, 0, 0];
  return encodePng(size, size, (px, py) => {
    const x = (px + 0.5) / size * 2 - 1;
    const y = (py + 0.5) / size * 2 - 1;
    const r = Math.hypot(x, y);
    const angle = Math.atan2(y, x);
    const inside = {
      circle: r < 0.85,
      ring: r < 0.85 && r > 0.55,
      square: Math.abs(x) < 0.75 && Math.abs(y) < 0.75,
      diamond: Math.abs(x) + Math.abs(y) < 0.9,
      triangle: y < 0.7 && y > -0.8 && Math.abs(x) < (y + 0.8) * 0.6,
      star: r < 0.45 + 0.4 * Math.abs(Math.cos(2.5 * angle)),
      plus: (Math.abs(x) < 0.25 && Math.abs(y) < 0.85) || (Math.abs(y) < 0.25 && Math.abs(x) < 0.85),
      heart: (x * x + (-y * 1.2 - Math.sqrt(Math.abs(x)) * 0.6) ** 2) < 0.6,
    }[shape];
    return inside ? colour : clear;
  });
}

/** A test card of any size: a gradient with a grid and a border, so scaling and cropping are visible. */
export function testCard(rng: Rng, width: number, height: number): Uint8Array {
  const a = hsl(rng.int(0, 360), 0.5, 0.5);
  const b = hsl(rng.int(0, 360), 0.5, 0.25);
  const white: Rgba = [255, 255, 255, 255];
  const step = Math.max(8, Math.round(Math.min(width, height) / 8));
  return encodePng(width, height, (x, y) => {
    if (x < 2 || y < 2 || x >= width - 2 || y >= height - 2) return white;
    if (x % step === 0 || y % step === 0) return mix(white, b, 0.6);
    return mix(a, b, y / height);
  });
}
