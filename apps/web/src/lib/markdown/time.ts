/** Message and markdown timestamps through Intl with the user's locale (client.md section 12). */
import type { TimeStyle } from './parse.ts';

const locale = () => (typeof navigator === 'undefined' ? 'en' : navigator.language);
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** The creation time encoded in a ULID. */
export function ulidTime(id: string): Date {
  let t = 0;
  for (const c of id.slice(0, 10)) t = t * 32 + CROCKFORD.indexOf(c);
  return new Date(t);
}

export function formatStyle(date: Date, style: TimeStyle): string {
  const l = locale();
  switch (style) {
    case 't': return date.toLocaleTimeString(l, { hour: '2-digit', minute: '2-digit' });
    case 'T': return date.toLocaleTimeString(l, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    case 'd': return date.toLocaleDateString(l);
    case 'D': return date.toLocaleDateString(l, { dateStyle: 'long' });
    case 'f': return date.toLocaleString(l, { dateStyle: 'long', timeStyle: 'short' });
    case 'F': return date.toLocaleString(l, { dateStyle: 'full', timeStyle: 'short' });
    case 'R': return relative(date);
  }
}

export function relative(date: Date, now = new Date()): string {
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' });
  const s = (date.getTime() - now.getTime()) / 1000;
  const units: [Intl.RelativeTimeFormatUnit, number][] = [['year', 31_536_000], ['month', 2_592_000], ['week', 604_800], ['day', 86_400], ['hour', 3600], ['minute', 60], ['second', 1]];
  for (const [unit, secs] of units) if (Math.abs(s) >= secs || unit === 'second') return rtf.format(Math.round(s / secs), unit);
  return '';
}

export const timeOfDay = (d: Date) => d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
export const fullDate = (d: Date) => d.toLocaleString(locale(), { dateStyle: 'full', timeStyle: 'short' });
export const shortDate = (d: Date) => d.toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' });
export const dayLabel = (d: Date) => d.toLocaleDateString(locale(), { dateStyle: 'long' });
export const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
