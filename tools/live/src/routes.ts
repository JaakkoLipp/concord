/**
 * The front door (m3-plan.md task 7): what each public path on the main domain and on ref.<domain> answers.
 * Usage: node tools/live/src/routes.ts
 */
import { APP } from './browser.ts';

const origin = new URL(APP).origin;
const ref = origin.replace('://', '://ref.');
const cases: [string, number, string?][] = [
  [`${origin}/`, 302, '/app'],
  [`${origin}/login`, 302, '/app'],
  [`${origin}/invite/abc123`, 302, '/app/invite/abc123'],
  [`${origin}/app`, 200],
  [`${origin}/app/nope`, 404],
  [`${origin}/api/`, 200],
  [`${origin}/.well-known/stoat`, 200],
  [`${ref}/`, 200],
];
let failed = 0;
for (const [url, status, location] of cases) {
  const r = await fetch(url, { redirect: 'manual' });
  const where = r.headers.get('location') ?? '';
  const ok = r.status === status && (!location || new URL(where, url).pathname === location);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${url} -> ${r.status}${where ? ` ${where}` : ''}`);
}
const post = await fetch(`${origin}/api/auth/account/create`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
console.log(`${post.status === 403 ? 'ok  ' : 'FAIL'} public account create -> ${post.status}`);
if (post.status !== 403) failed++;
console.log(failed ? `routes: ${failed} failed` : 'routes: all passed');
process.exit(failed ? 1 : 0);
