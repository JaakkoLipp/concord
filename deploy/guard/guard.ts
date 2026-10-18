/**
 * The history guard (m4.7-plan.md task 12): a Stoat bot, in its own container with no ports, that cuts a wipe short.
 * It isn't part of concord-web: a bot that outranks the moderators shouldn't sit in the web server's process.
 *
 * - A deletion, ban or role event in the guarded server makes it read the audit log at once, coalesced, and every minute
 *   anyway. It saves the last entry it read, so a restart misses nothing, and judges each entry by its own time.
 * - Past a limit (rules.ts), it strips the person's roles, since Stoat won't time out anyone who can time out others,
 *   records which, and DMs the owner and admins who did what and which restore to run. The owner is never touched.
 * - The owner undoes a false alarm in one step: a DM to the bot saying `restore <user ID>` gives the roles back, as does
 *   `node guard.ts restore <user ID>` in the container.
 * - Every 10 minutes it checks that its role is the top one after the owner's, that it can still act, and that no other
 *   bot ranks above the moderators, and tells the owner if not. It writes a heartbeat each minute for status.sh.
 *
 * Its settings are in the server-only host.env: GUARD_BOT_TOKEN, GUARD_SERVER, GUARD_ALERT (user IDs besides the owner)
 * and the limits (rules.ts). Run with Node's type stripping: node guard.ts
 */
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { judge, limitsFrom, prune, tallies, type Tally, type WireEntry } from './rules.ts';

const env = process.env;
const API = (env.STOAT_API ?? 'http://api:14702').replace(/\/$/, '');
const WS = env.STOAT_WS ?? 'ws://events:14703';
const TOKEN = env.GUARD_BOT_TOKEN ?? '';
const SERVER = env.GUARD_SERVER ?? '';
const DATA = env.GUARD_DATA ?? '/data';
const LIMITS = limitsFrom(env);
const ALERT_EXTRA = (env.GUARD_ALERT ?? '').split(',').map((s) => s.trim()).filter(Boolean);

// Bits from packages/domain/src/permissions.ts.
const VIEW_AUDIT_LOGS = 1n << 40n;
const ASSIGN_ROLES = 1n << 9n;
const MANAGE_MESSAGES = 1n << 23n;
const KICK_MEMBERS = 1n << 6n;

interface Strip { user: string; roles: string[]; at: number; reason: string; restored?: boolean }
interface State { lastEntry: string | null; history: Tally[]; strips: Strip[]; heartbeat: number; warned: Record<string, number> }

const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

function load(): State {
  try {
    return JSON.parse(readFileSync(`${DATA}/guard.json`, 'utf8')) as State;
  } catch {
    return { lastEntry: null, history: [], strips: [], heartbeat: 0, warned: {} };
  }
}
const state = load();
/** Written beside and renamed, so a crash never leaves half a file. */
function save(): void {
  writeFileSync(`${DATA}/guard.json.tmp`, JSON.stringify(state));
  renameSync(`${DATA}/guard.json.tmp`, `${DATA}/guard.json`);
}

async function api<T>(method: string, path: string, body?: unknown, reason?: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const headers: Record<string, string> = { 'x-bot-token': TOKEN };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (reason) headers['x-audit-log-reason'] = reason;
    const res = await fetch(`${API}${path}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10_000) });
    if (res.status === 429 && attempt < 10) {
      const after = Number(res.headers.get('x-ratelimit-reset-after')) || 1_000;
      await new Promise((r) => setTimeout(r, after + 100));
      continue;
    }
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text.slice(0, 200)}`);
    return (text ? JSON.parse(text) : undefined) as T;
  }
}

interface WireServer { _id: string; owner: string; name: string; roles?: Record<string, { name: string; rank: number; permissions: { a: number; d: number } }> }
interface WireMember { _id: { user: string }; roles?: string[] }
const server = () => api<WireServer>('GET', `/servers/${SERVER}`);
let me = '';

/** DMs the owner and the admins on GUARD_ALERT. A failed DM is logged; the action already happened. */
async function alert(text: string): Promise<void> {
  const owner = (await server()).owner;
  for (const user of new Set([owner, ...ALERT_EXTRA])) {
    try {
      const dm = await api<{ _id: string }>('GET', `/users/${user}/dm`);
      await api('POST', `/channels/${dm._id}/messages`, { content: text });
    } catch (e) {
      log('alert failed for', user, String(e));
    }
  }
}

const restoreHint = (t: Tally) => (t.channel
  ? `To bring messages back: \`sudo ~/stoat/concord/restore-history.sh --channel ${t.channel} --at ${new Date(t.at - 60_000).toISOString().slice(0, 16)} --dry-run\`, then without --dry-run (vps-runbook.md section 9).`
  : '');

async function strip(t: Tally, reason: string): Promise<void> {
  // Already stripped for this burst: once is enough.
  if (state.strips.some((s) => s.user === t.user && !s.restored && s.at > t.at - 10 * 60_000)) return;
  const member = await api<WireMember>('GET', `/servers/${SERVER}/members/${t.user}`).catch(() => null);
  const roles = member?.roles ?? [];
  if (roles.length) await api('PATCH', `/servers/${SERVER}/members/${t.user}`, { remove: ['Roles'] }, `Concord guard: ${reason}`);
  state.strips.push({ user: t.user, roles, at: t.at, reason });
  save();
  log('stripped', t.user, roles, reason);
  await alert([
    `**Guard**: <@${t.user}> ${reason}. I took their roles${roles.length ? '' : ' (they had none)'}, so they can't go on.`,
    restoreHint(t),
    `If this was a mistake, reply \`restore ${t.user}\` and I'll give the roles back.`,
  ].filter(Boolean).join('\n'));
}

/** Reads every audit log entry after the last one read, oldest first, and judges each. One at a time. */
let reading: Promise<void> | null = null;
let again = false;
function readSoon(): void {
  if (reading) { again = true; return; }
  reading = (async () => {
    try {
      do { again = false; await readLog(); } while (again);
    } catch (e) {
      log('reading the audit log failed:', String(e));
    } finally {
      reading = null;
    }
  })();
}

async function readLog(): Promise<void> {
  const owner = (await server()).owner;
  for (;;) {
    const q = new URLSearchParams({ limit: '100' });
    if (state.lastEntry) q.set('after', state.lastEntry);
    const page = await api<{ audit_logs: WireEntry[] }>('GET', `/servers/${SERVER}/audit_logs?${q}`);
    const entries = page.audit_logs.sort((a, b) => (a._id < b._id ? -1 : 1));
    // The first run starts from now: the past isn't judged, only what follows.
    if (!state.lastEntry) {
      state.lastEntry = entries.at(-1)?._id ?? '0';
      save();
      return;
    }
    for (const e of entries) {
      if (e.user !== owner && e.user !== me) {
        for (const t of tallies(e)) {
          const verdict = judge(state.history, t, LIMITS);
          state.history.push(t);
          if (verdict.action === 'strip') await strip(t, verdict.reason);
          else if (verdict.action === 'alert') await alert(`**Guard**: <@${t.user}> ${verdict.reason}. A second in 24 hours takes their roles.\n${restoreHint(t)}`);
        }
      }
      state.lastEntry = e._id;
    }
    state.history = prune(state.history, Date.now());
    save();
    if (entries.length < 100) return;
  }
}

/** Gives back the roles a strip took. */
async function restore(user: string): Promise<string> {
  const s = [...state.strips].reverse().find((x) => x.user === user && !x.restored);
  if (!s) return `I have no record of taking roles from <@${user}>.`;
  const member = await api<WireMember>('GET', `/servers/${SERVER}/members/${user}`);
  const roles = [...new Set([...(member.roles ?? []), ...s.roles])];
  await api('PATCH', `/servers/${SERVER}/members/${user}`, { roles }, 'Concord guard: the owner gave the roles back');
  s.restored = true;
  save();
  return `Gave <@${user}> their roles back.`;
}

/** The owner's DM commands: only `restore <user ID>`. */
async function command(author: string, channel: string, content: string): Promise<void> {
  if (author !== (await server()).owner) return;
  const m = /^restore\s+<?@?([0-9A-HJKMNP-TV-Z]{26})>?\s*$/i.exec(content.trim());
  if (!m) return;
  const answer = await restore(m[1]!.toUpperCase()).catch((e: unknown) => `Couldn't give the roles back: ${String(e)}`);
  await api('POST', `/channels/${channel}/messages`, { content: answer }).catch(() => {});
}

/** Every 10 minutes: still on top, still able to act, and no other bot above the moderators. */
async function checkHealth(): Promise<void> {
  const problems: string[] = [];
  try {
    const s = await server();
    const roles = s.roles ?? {};
    const mine = await api<WireMember>('GET', `/servers/${SERVER}/members/${me}`);
    const rankOf = (ids: string[]) => Math.min(...ids.map((id) => roles[id]?.rank ?? Infinity));
    const myRank = rankOf(mine.roles ?? []);
    const top = Math.min(...Object.values(roles).map((r) => r.rank));
    if (myRank !== top) problems.push('my role is no longer the top one after yours: put it back above every other role');
    const allowed = (mine.roles ?? []).reduce((v, id) => v | BigInt(roles[id]?.permissions.a ?? 0), 0n);
    for (const [bit, name] of [[VIEW_AUDIT_LOGS, 'View audit logs'], [ASSIGN_ROLES, 'Assign roles']] as const) {
      if ((allowed & bit) !== bit) problems.push(`my role lacks ${name}`);
    }
    // Other bots ranked above the strongest moderator role, which could strip the guard or act unwatched.
    const modRank = Math.min(...Object.values(roles).filter((r) => (BigInt(r.permissions.a) & (MANAGE_MESSAGES | KICK_MEMBERS)) !== 0n).map((r) => r.rank));
    const { members, users } = await api<{ members: WireMember[]; users: { _id: string; bot?: unknown }[] }>('GET', `/servers/${SERVER}/members`);
    const bots = new Set(users.filter((u) => u.bot).map((u) => u._id));
    for (const m of members) {
      if (m._id.user !== me && bots.has(m._id.user) && rankOf(m.roles ?? []) <= modRank) problems.push(`the bot <@${m._id.user}> ranks above the moderators`);
    }
  } catch (e) {
    problems.push(`I couldn't check my role: ${String(e)}`);
  }
  for (const p of problems) {
    // Each problem at most every 6 hours.
    if ((state.warned[p] ?? 0) > Date.now() - 6 * 60 * 60_000) continue;
    state.warned[p] = Date.now();
    await alert(`**Guard check**: ${p}.`);
  }
  save();
}

function connect(): void {
  const ws = new WebSocket(`${WS}/?version=1&format=json`);
  let ping: ReturnType<typeof setInterval> | undefined;
  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'Authenticate', token: TOKEN }));
    ping = setInterval(() => ws.send(JSON.stringify({ type: 'Ping', data: Date.now() })), 20_000);
  };
  ws.onmessage = (m) => {
    const frames = ((): { type: string; [k: string]: unknown }[] => {
      const f = JSON.parse(String(m.data)) as { type: string; v?: unknown[] };
      return f.type === 'Bulk' ? (f.v ?? []) as never : [f as never];
    })();
    for (const f of frames) {
      if (f.type === 'Ready') readSoon();
      // Deletions, bans and role deletions: read the log now, coalesced with any read under way.
      if (['MessageDelete', 'BulkMessageDelete', 'ChannelDelete', 'ServerMemberLeave', 'ServerRoleDelete'].includes(f.type)) readSoon();
      // Never act on our own messages, and only DMs reach commands.
      if (f.type === 'Message' && f.author !== me && typeof f.content === 'string') {
        void api<{ channel_type: string }>('GET', `/channels/${String(f.channel)}`)
          .then((c) => { if (c.channel_type === 'DirectMessage') return command(String(f.author), String(f.channel), String(f.content)); })
          .catch(() => {});
      }
    }
  };
  ws.onclose = () => {
    clearInterval(ping);
    log('socket closed, reconnecting in 5 s');
    setTimeout(connect, 5_000);
  };
  ws.onerror = () => ws.close();
}

async function main(): Promise<void> {
  if (!TOKEN || !/^[0-9A-HJKMNP-TV-Z]{26}$/.test(SERVER)) {
    log('not configured: GUARD_BOT_TOKEN and GUARD_SERVER are needed in host.env');
    process.exit(78);
  }
  me = (await api<{ _id: string }>('GET', '/users/@me'))._id;
  if (process.argv[2] === 'restore' && process.argv[3]) {
    console.log(await restore(process.argv[3].toUpperCase()));
    return;
  }
  // Down for more than 5 minutes: say so once back, after catching up.
  const down = state.heartbeat && Date.now() - state.heartbeat > 5 * 60_000 ? state.heartbeat : 0;
  log('guarding', SERVER, 'as', me);
  connect();
  readSoon();
  if (down) await alert(`**Guard**: I was down from ${new Date(down).toISOString().slice(0, 16)} UTC until now, and have caught up on the audit log since.`).catch(() => {});
  const beat = () => { state.heartbeat = Date.now(); writeFileSync(`${DATA}/heartbeat`, String(state.heartbeat)); save(); };
  beat();
  setInterval(beat, 60_000);
  setInterval(readSoon, 60_000);
  void checkHealth();
  setInterval(() => void checkHealth(), 10 * 60_000);
}

void main().catch((e: unknown) => {
  log('fatal:', String(e));
  process.exit(1);
});
