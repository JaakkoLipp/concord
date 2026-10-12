/**
 * Offline scrubber: turns raw captures in `.raw/` into committed fixtures (docs/dev-environment.md section 6).
 *
 * 1. Secrets: values of secret fields and headers are collected first, then replaced everywhere they appear.
 * 2. Emails, invite codes and IP addresses are replaced with placeholders.
 * 3. Every ULID maps to a stable fake ULID that keeps order and relative time, rebased to a fixed epoch.
 *    ISO timestamps move by the same offset. `spreadDays` stretches the timeline over that many days.
 * 4. A final pattern pass fails if an email, IPv4 address or JWT is left.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const SCRUB_RULES_VERSION = 4;

const SECRET_KEYS = new Set([
  'token', 'session_token', 'mfa_ticket', 'ticket', 'secret', 'totp_code', 'recovery_code', 'password', 'email',
  'x-session-token', 'x-bot-token', 'x-mfa-ticket', 'endpoint', 'p256dh', 'auth',
]);
const SECRET_ARRAY_KEYS = new Set(['recovery_codes']);
/** Routes whose whole response body is secret but carries no field name: recovery codes come back as a bare array. */
const SECRET_RESPONSE_ROUTES = [/^\/auth\/mfa\/recovery/];
const ULID = /\b[0-9A-HJKMNP-TV-Z]{26}\b/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const IPV4 = /\b(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}\b/g;
const IPV6 = /\b(?:[0-9a-f]{1,4}:){3,7}[0-9a-f]{1,4}\b/gi;
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
const ISO = /\b20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)\b/g;
const PLACEHOLDER_EMAIL = 'user@example.invalid';
/** Fixture time zero: 2026-01-05 09:00 UTC, a Monday morning. */
const EPOCH = Date.UTC(2026, 0, 5, 9, 0, 0);
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export interface ScrubOptions {
  rawDir: string;
  outDir: string;
  /** Known invite codes, which have no field name to recognise them by in every response. */
  inviteCodes?: string[];
  spreadDays?: number;
}

interface RawRest { step: string; actor: string; request: { method: string; path: string; headers?: Record<string, string>; body?: unknown }; response: unknown }

export function scrubAll(opts: ScrubOptions): { files: number } {
  const scenarios = readdirSync(opts.rawDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  const texts = new Map<string, string>();
  for (const s of scenarios) {
    for (const f of readdirSync(join(opts.rawDir, s)).sort()) texts.set(`${s}/${f}`, readFileSync(join(opts.rawDir, s, f), 'utf8'));
  }

  // 1. Collect secret values from every file, so a token seen in one place is replaced in all of them.
  const secrets = new Map<string, string>();
  const note = (value: unknown, kind: string) => {
    if (typeof value === 'string' && value.length >= 6 && !secrets.has(value)) secrets.set(value, `<${kind}-${secrets.size + 1}>`);
  };
  const walk = (v: unknown, key = ''): void => {
    if (Array.isArray(v)) {
      for (const item of v) {
        if (SECRET_ARRAY_KEYS.has(key)) note(item, key);
        else walk(item, key);
      }
    } else if (v && typeof v === 'object') {
      for (const [k, child] of Object.entries(v)) {
        const lower = k.toLowerCase();
        if (SECRET_KEYS.has(lower) && typeof child === 'string') note(child, lower === 'email' ? 'email' : 'secret');
        else walk(child, lower);
      }
    }
  };
  for (const [name, text] of texts) {
    for (const line of name.endsWith('.jsonl') ? text.split('\n').filter(Boolean) : [text]) walk(JSON.parse(line));
    if (!name.endsWith('.jsonl')) {
      const rest = JSON.parse(text) as RawRest & { response: { body: unknown } };
      if (SECRET_RESPONSE_ROUTES.some((r) => r.test(rest.request.path))) walk({ recovery_codes: rest.response.body });
    }
  }
  // Values from secret fields are replaced as whole JSON strings, so a 6-digit TOTP code never rewrites part of a
  // number. Extra values, such as invite codes and verification tokens, also appear inside paths, so they are
  // replaced as substrings. They are long and random, so they cannot collide with anything else.
  const quoted = [...secrets.entries()].map(([v, p]) => [JSON.stringify(v), JSON.stringify(p)] as const);
  const extras = new Map<string, string>();
  for (const code of opts.inviteCodes ?? []) if (code.length >= 8 && !extras.has(code)) extras.set(code, `INVITE${extras.size + 1}`);
  // Long values first, so a secret containing another is replaced whole.
  const ordered = [...quoted, ...extras.entries()].sort((a, b) => b[0].length - a[0].length);
  const collected = [...secrets.keys(), ...extras.keys()];

  // 2. ULIDs: collect every one, then assign fake ULIDs in the same order with rebased times.
  const ulids = new Set<string>();
  for (const text of texts.values()) for (const m of text.matchAll(ULID)) ulids.add(m[0]);
  const sorted = [...ulids].sort();
  // The origin is the earliest ID of the recording session itself. Probe IDs such as 01AAAA… decode to
  // years earlier; letting them set the origin would push every real time years past the epoch.
  const times = sorted.map(decodeTime);
  const median = [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)] ?? 0;
  const session = times.filter((t) => t >= median - 365 * 86_400_000);
  const t0 = Math.min(...session);
  const t1 = Math.max(...session);
  const stretch = opts.spreadDays && t1 > t0 ? (opts.spreadDays * 86_400_000) / (t1 - t0) : 1;
  const rebase = (t: number) => (t < t0 ? Math.max(0, EPOCH - (t0 - t)) : EPOCH + Math.round((t - t0) * stretch));
  const fake = new Map<string, string>();
  sorted.forEach((u, i) => fake.set(u, encodeTime(rebase(decodeTime(u))) + encodeRandom(i)));

  // 3. Rewrite into a temporary directory, which replaces the committed one only after the checks pass.
  const finalDir = opts.outDir;
  const tmpDir = `${finalDir}.tmp`;
  rmSync(tmpDir, { recursive: true, force: true });
  let files = 0;
  const scrubText = (text: string) => {
    let out = text;
    for (const [value, placeholder] of ordered) out = out.split(value).join(placeholder);
    out = out.replace(EMAIL, (m) => (m === PLACEHOLDER_EMAIL ? m : PLACEHOLDER_EMAIL));
    out = out.replace(IPV4, '192.0.2.1');
    out = out.replace(ULID, (m) => fake.get(m) ?? m);
    out = out.replace(ISO, (m) => new Date(rebase(Date.parse(m))).toISOString());
    return out;
  };
  for (const [name, text] of texts) {
    const [scenario, file] = name.split('/') as [string, string];
    const clean = scrubText(text);
    let target: string;
    if (file === 'ws.jsonl') target = 'ws.jsonl';
    else {
      const rest = JSON.parse(clean) as RawRest;
      const route = rest.request.path.split('?')[0]!.replace(/[0-9A-HJKMNP-TV-Z]{26}/g, 'ID').replace(/<[^>]+>/g, 'X')
        .replace(/[^A-Za-z0-9_@.-]+/g, '-').replace(/^-|-$/g, '') || 'root';
      target = `${file.replace('.json', '')}.rest.${rest.request.method}-${route}.json`;
    }
    if (name.endsWith('.jsonl')) for (const line of clean.split('\n').filter(Boolean)) JSON.parse(line);
    mkdirSync(join(tmpDir, scenario), { recursive: true });
    writeFileSync(join(tmpDir, scenario, target), clean.endsWith('\n') ? clean : clean + '\n');
    files++;
  }

  // 4. Pattern pass, plus a check that no collected secret survived in raw or JSON-escaped form.
  const leaks = findLeaks(tmpDir);
  const all = readdirSync(tmpDir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile())
    .map((e) => readFileSync(join(e.parentPath, e.name), 'utf8')).join('\n');
  for (const value of collected) {
    if (all.includes(value) || all.includes(JSON.stringify(value).slice(1, -1))) leaks.push(`collected secret survived: ${value.slice(0, 4)}…`);
  }
  if (leaks.length) {
    rmSync(tmpDir, { recursive: true, force: true });
    throw new Error(`scrub left sensitive values, nothing written:\n${leaks.slice(0, 20).join('\n')}`);
  }
  rmSync(finalDir, { recursive: true, force: true });
  renameSync(tmpDir, finalDir);
  return { files };
}

export function findLeaks(dir: string): string[] {
  const leaks: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    const text = readFileSync(path, 'utf8');
    for (const m of text.matchAll(EMAIL)) if (m[0] !== PLACEHOLDER_EMAIL) leaks.push(`${path}: email ${m[0]}`);
    for (const m of text.matchAll(IPV4)) if (m[0] !== '192.0.2.1' && !isVersionLike(text, m.index!)) leaks.push(`${path}: IPv4 ${m[0]}`);
    for (const m of text.matchAll(JWT)) leaks.push(`${path}: JWT ${m[0].slice(0, 16)}…`);
    for (const m of text.matchAll(IPV6)) leaks.push(`${path}: IPv6 ${m[0]}`);
  }
  return leaks;
}

/** `1.2.3.4` inside a version string such as `v1.9.14.0` is not an address. */
function isVersionLike(text: string, index: number): boolean {
  return /[v.]$/.test(text.slice(Math.max(0, index - 1), index));
}

function decodeTime(ulid: string): number {
  let t = 0;
  for (const c of ulid.slice(0, 10)) t = t * 32 + CROCKFORD.indexOf(c);
  return t;
}

function encodeTime(t: number): string {
  let out = '';
  for (let i = 0; i < 10; i++) {
    out = CROCKFORD[t % 32] + out;
    t = Math.floor(t / 32);
  }
  return out;
}

/** Deterministic 16-character random part from the ULID's rank, so equal times still sort in the original order. */
function encodeRandom(rank: number): string {
  const h = createHash('sha256').update(String(rank)).digest();
  let out = '';
  for (let r = rank, i = 0; i < 6; i++, r = Math.floor(r / 32)) out = CROCKFORD[r % 32] + out;
  for (let i = 0; out.length < 16; i++) out += CROCKFORD[h[i]! % 32];
  return out.slice(0, 16);
}
