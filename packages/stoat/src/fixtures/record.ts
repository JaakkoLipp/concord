/**
 * Fixture recorder (docs/dev-environment.md section 6). Run after `pnpm seed --reset`, on Jaakko's machine:
 *
 *   pnpm --filter @concord/stoat record                    record every scenario, then scrub
 *   pnpm --filter @concord/stoat record history events     record some scenarios, then scrub everything
 *   pnpm --filter @concord/stoat record --scrub-only       rescrub .raw/ without recording
 *   pnpm --filter @concord/stoat record --spread-days 5    spread message times over five days
 *
 * Raw captures go to fixtures/.raw/ (gitignored). Scrubbed fixtures go to fixtures/<stoat version>/.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BACKEND, loadState, SEED_DIR, type SeedState } from '../../../../tools/seed/src/config.ts';
import { passwordFor } from '../../../../tools/seed/src/seed.ts';
import { totp } from '../../../../tools/seed/src/totp.ts';
import { createAccount, verificationToken } from '../../../../tools/seed/src/vps.ts';
import { emojiShape } from '../../../../tools/seed/src/png.ts';
import { Rng } from '../../../../tools/seed/src/rng.ts';
import { LiveTransport } from '../live.ts';
import { readyQuery, type Frame, type HttpResponse, type Socket, type Transport } from '../transport.ts';
import { Recording } from './recording.ts';
import { SCRUB_RULES_VERSION, scrubAll } from './scrub.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures');
const RAW = join(FIXTURES, '.raw');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const live = new LiveTransport(BACKEND);

/** Values with no tell-tale field name, such as invite codes and verification tokens, scrubbed by value. */
const extraSecrets = new Set<string>();

class Client {
  token = '';
  readonly t: Transport;
  constructor(t: Transport) {
    this.t = t;
  }
  call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<HttpResponse> {
    return this.t.request({
      method, path,
      headers: { ...(this.token ? { 'x-session-token': this.token } : {}), ...headers },
      ...(body === undefined ? {} : { body }),
    });
  }
  async ok<T = unknown>(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
    for (;;) {
      const res = await this.call(method, path, body, headers);
      if (res.status === 429) {
        await sleep(Number((res.body as { retry_after?: number })?.retry_after ?? 1000) + 100);
        continue;
      }
      if (res.status >= 300) throw new Error(`${method} ${path}: ${res.status} ${JSON.stringify(res.body)}`);
      return res.body as T;
    }
  }
}

/** Sign in outside any recording, for actors whose own login is not what the scenario captures. */
const sessions = new Map<string, string>();
async function session(state: SeedState, handle: string): Promise<string> {
  const cached = sessions.get(handle);
  if (cached) return cached;
  const c = new Client(live);
  const res = await c.ok<{ result: string; token: string }>('POST', '/auth/session/login', {
    email: state.personas[handle]!.email, password: passwordFor(handle), friendly_name: 'Concord recorder',
  });
  if (res.result !== 'Success') throw new Error(`login ${handle}: ${res.result}`);
  sessions.set(handle, res.token);
  return res.token;
}

async function client(rec: Recording, state: SeedState, handle: string, observe = false): Promise<Client> {
  const c = new Client(rec.wrap(live, { actor: handle, observe }));
  c.token = await session(state, handle);
  return c;
}

/** Open a socket, authenticate with a first frame and wait for Ready. */
async function openSocket(c: Client, query = ''): Promise<{ socket: Socket; ready: Frame }> {
  const socket = await c.t.connect(query);
  const ready = new Promise<Frame>((resolve, reject) => {
    const off = socket.onFrame((f) => {
      if (f.type === 'Ready') { off(); resolve(f); }
      if (f.type === 'Error') reject(new Error(JSON.stringify(f)));
    });
  });
  socket.send({ type: 'Authenticate', token: c.token });
  return { socket, ready: await ready };
}

function waitForFrame(socket: Socket, match: (f: Frame) => boolean, ms: number): Promise<Frame | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { off(); resolve(null); }, ms);
    const off = socket.onFrame((f) => {
      if (match(f)) { clearTimeout(timer); off(); resolve(f); }
    });
  });
}

type ScenarioFn = (rec: Recording, state: SeedState) => Promise<void>;

const scenarios: Record<string, ScenarioFn> = {
  async login(rec, state) {
    const c = new Client(rec.wrap(live, { actor: 'dev' }));
    const email = state.personas.dev!.email;
    rec.mark('wrong password');
    await c.call('POST', '/auth/session/login', { email, password: 'not-the-password', friendly_name: 'Concord recorder' });
    rec.mark('login');
    const res = await c.ok<{ token: string }>('POST', '/auth/session/login', { email, password: passwordFor('dev'), friendly_name: 'Concord recorder' });
    c.token = res.token;
    rec.mark('hello');
    await c.ok('GET', '/onboard/hello');
    rec.mark('self');
    await c.ok('GET', '/users/@me');
    rec.mark('account');
    await c.ok('GET', '/auth/account/');
    rec.mark('sessions');
    await c.ok('GET', '/auth/session/all');
    rec.mark('logout');
    await c.ok('POST', '/auth/session/logout');
  },

  async mfa(rec, state) {
    const c = new Client(rec.wrap(live, { actor: 'totp' }));
    const p = state.personas.totp!;
    // Stoat checks the code against the server's current 30-second window with no tolerance, so answer
    // mid-window, where a second or two of clock difference between this machine and the VPS cannot matter.
    const into = Date.now() % 30_000;
    if (into < 8_000 || into > 20_000) await sleep((38_000 - into) % 30_000);
    rec.mark('password step');
    const first = await c.ok<{ result: string; ticket: string }>('POST', '/auth/session/login', { email: p.email, password: passwordFor('totp'), friendly_name: 'Concord recorder' });
    rec.mark('totp step');
    const ok = await c.ok<{ token: string }>('POST', '/auth/session/login', { mfa_ticket: first.ticket, mfa_response: { totp_code: totp(p.totpSecret!) }, friendly_name: 'Concord recorder' });
    c.token = ok.token;
    rec.mark('mfa status');
    await c.ok('GET', '/auth/mfa/');
    await c.ok('GET', '/auth/mfa/methods');
    rec.mark('recovery codes');
    // With TOTP enabled, a password no longer creates an MFA ticket: DisallowedMFAMethod.
    rec.mark('ticket by password, refused');
    await c.call('PUT', '/auth/mfa/ticket', { password: passwordFor('totp') });
    rec.mark('ticket by totp');
    const ticket = await c.ok<{ token: string }>('PUT', '/auth/mfa/ticket', { totp_code: totp(p.totpSecret!) });
    const codes = await c.ok<string[]>('PATCH', '/auth/mfa/recovery', undefined, { 'x-mfa-ticket': ticket.token });
    rec.mark('recovery login');
    const again = await c.ok<{ ticket: string }>('POST', '/auth/session/login', { email: p.email, password: passwordFor('totp'), friendly_name: 'Concord recorder' });
    const viaCode = await c.ok<{ token: string }>('POST', '/auth/session/login', { mfa_ticket: again.ticket, mfa_response: { recovery_code: codes[0] }, friendly_name: 'Concord recorder' });
    rec.mark('logout');
    await c.ok('POST', '/auth/session/logout');
    c.token = viaCode.token;
    await c.ok('POST', '/auth/session/logout');
  },

  async onboarding(rec, state) {
    const handle = `rec${Date.now().toString(36)}`;
    const email = `${handle}@${state.emailDomain}`;
    const started = new Date();
    await createAccount(email, passwordFor(handle));
    const token = await verificationToken(email, started);
    extraSecrets.add(token);
    const c = new Client(rec.wrap(live, { actor: 'new' }));
    rec.mark('verify');
    const verified = await c.ok<{ ticket: { token: string } }>('POST', `/auth/account/verify/${token}`);
    rec.mark('ticket login');
    const res = await c.ok<{ token: string }>('POST', '/auth/session/login', { mfa_ticket: verified.ticket.token, friendly_name: 'Concord recorder' });
    c.token = res.token;
    rec.mark('hello');
    await c.ok('GET', '/onboard/hello');
    rec.mark('invalid username');
    await c.call('POST', '/onboard/complete', { username: 'x' });
    rec.mark('complete');
    await c.ok('POST', '/onboard/complete', { username: handle });
    rec.mark('invite');
    await c.ok('GET', `/invites/${state.inviteCode}`);
    await c.ok('POST', `/invites/${state.inviteCode}`);
  },

  async errors(rec, state) {
    const anon = new Client(rec.wrap(live, { actor: 'anonymous' }));
    const dev = await client(rec, state, 'dev');
    const lauri = await client(rec, state, 'lauri');
    rec.mark('root');
    await anon.ok('GET', '/');
    rec.mark('401');
    await anon.call('GET', '/users/@me');
    rec.mark('403');
    await dev.call('POST', '/servers/create', { name: 'Not allowed' });
    await dev.call('POST', `/channels/${state.channels.yleinen}/invites`);
    rec.mark('404');
    await dev.call('GET', '/channels/01AAAAAAAAAAAAAAAAAAAAAAAA');
    rec.mark('409');
    await dev.call('POST', '/users/friend', { username: state.personas.aino!.username });
    rec.mark('429');
    for (let i = 0; i < 3; i++) await lauri.call('PATCH', '/users/@me', { status: { text: 'Kuuntelee musiikkia' } });
  },

  async ready(rec, state) {
    const dev = await client(rec, state, 'dev', true);
    rec.mark('default fields');
    (await openSocket(dev)).socket.close();
    await sleep(500);
    rec.mark('client fields');
    (await openSocket(dev, readyQuery())).socket.close();
    await sleep(500);
  },

  async sync(rec, state) {
    const dev = await client(rec, state, 'dev');
    rec.mark('unreads');
    await dev.ok('GET', '/sync/unreads');
    rec.mark('settings');
    await dev.ok('POST', '/sync/settings/fetch', { keys: ['ordering', 'notifications', 'concord:emoji'] });
    await dev.ok('POST', `/sync/settings/set?timestamp=${Date.now()}`, { 'concord:recorder': '{"v":1}' });
    await dev.ok('POST', '/sync/settings/fetch', { keys: ['concord:recorder'] });
  },

  async people(rec, state) {
    const dev = await client(rec, state, 'dev');
    const s = state.serverId;
    const aino = state.personas.aino!.userId;
    rec.mark('members');
    await dev.ok('GET', `/servers/${s}/members`);
    await dev.ok('GET', `/servers/${s}/members?exclude_offline=true`);
    await dev.ok('GET', `/servers/${s}/members/${aino}`);
    rec.mark('profile');
    await dev.ok('GET', `/users/${aino}`);
    await dev.ok('GET', `/users/${aino}/profile`);
    await dev.ok('GET', `/users/${aino}/mutual`);
    rec.mark('server');
    await dev.ok('GET', `/servers/${s}`);
    await dev.ok('GET', `/servers/${s}/emojis`);
    rec.mark('dms');
    await dev.ok('GET', '/users/dms');
    rec.mark('invite');
    await dev.ok('GET', `/invites/${state.inviteCode}`);
  },

  async history(rec, state) {
    const dev = await client(rec, state, 'dev');
    const ch = state.channels.yleinen!;
    rec.mark('default page');
    const latest = await dev.ok<{ _id: string }[]>('GET', `/channels/${ch}/messages`);
    const anchor = latest[latest.length - 1]!._id;
    rec.mark('with users');
    await dev.ok('GET', `/channels/${ch}/messages?limit=100&include_users=true`);
    rec.mark('before');
    await dev.ok('GET', `/channels/${ch}/messages?limit=20&before=${anchor}`);
    rec.mark('after, default sort');
    await dev.ok('GET', `/channels/${ch}/messages?limit=20&after=${anchor}`);
    rec.mark('after, oldest first');
    await dev.ok('GET', `/channels/${ch}/messages?limit=20&after=${anchor}&sort=Oldest`);
    rec.mark('nearby');
    await dev.ok('GET', `/channels/${ch}/messages?limit=20&nearby=${anchor}`);
    rec.mark('single');
    await dev.ok('GET', `/channels/${ch}/messages/${anchor}`);
    rec.mark('search');
    await dev.call('POST', `/channels/${ch}/search`, { query: 'sauna', limit: 10 });
    await dev.call('POST', `/channels/${ch}/search`, { pinned: true, limit: 10 });
  },

  async events(rec, state) {
    const dev = await client(rec, state, 'dev', true);
    const aino = await client(rec, state, 'aino');
    const admin = await client(rec, state, 'dev-admin');
    const ch = state.channels.yleinen!;
    const s = state.serverId;
    const { socket } = await openSocket(dev, readyQuery());
    const settle = () => sleep(1500);

    rec.mark('message');
    const msg = await aino.ok<{ _id: string }>('POST', `/channels/${ch}/messages`, { content: 'Tallennus: hei kaikki', nonce: '01RECORDERNONCE0000000000A' });
    await settle();
    rec.mark('mention');
    await aino.ok('POST', `/channels/${ch}/messages`, { content: `<@${state.personas.dev!.userId}> katso tämä` });
    await settle();
    rec.mark('edit');
    await aino.ok('PATCH', `/channels/${ch}/messages/${msg._id}`, { content: 'Tallennus: hei kaikki (muokattu)' });
    await settle();
    rec.mark('react');
    await aino.ok('PUT', `/channels/${ch}/messages/${msg._id}/reactions/${encodeURIComponent('👍')}`);
    await aino.ok('PUT', `/channels/${ch}/messages/${msg._id}/reactions/${state.emoji.sauna}`);
    await settle();
    rec.mark('unreact');
    await aino.ok('DELETE', `/channels/${ch}/messages/${msg._id}/reactions/${encodeURIComponent('👍')}`);
    await settle();
    rec.mark('pin');
    await admin.ok('POST', `/channels/${ch}/messages/${msg._id}/pin`);
    await settle();
    rec.mark('unpin');
    await admin.ok('DELETE', `/channels/${ch}/messages/${msg._id}/pin`);
    await settle();
    rec.mark('append');
    await aino.ok('POST', `/channels/${ch}/messages`, { content: 'https://en.wikipedia.org/wiki/Sauna' });
    await waitForFrame(socket, (f) => f.type === 'MessageAppend', 15_000);
    await settle();
    rec.mark('delete');
    await aino.ok('DELETE', `/channels/${ch}/messages/${msg._id}`);
    await settle();

    rec.mark('typing');
    const ainoLive = new Client(live);
    ainoLive.token = aino.token;
    const typer = await openSocket(ainoLive);
    typer.socket.send({ type: 'BeginTyping', channel: ch });
    await settle();
    typer.socket.send({ type: 'EndTyping', channel: ch });
    await settle();

    rec.mark('presence');
    for (const presence of ['Busy', 'Idle', 'Focus', 'Online']) {
      await aino.ok('PATCH', '/users/@me', { status: { text: 'Moderoimassa', presence } });
      await sleep(5200);
    }
    rec.mark('disconnect');
    typer.socket.close();
    await settle();

    rec.mark('channel');
    const created = await admin.ok<{ _id: string }>('POST', `/servers/${s}/channels`, { type: 'Text', name: 'tallennus' });
    await settle();
    await admin.ok('PATCH', `/channels/${created._id}`, { name: 'tallennus-2', description: 'Väliaikainen' });
    await settle();
    await admin.ok('DELETE', `/channels/${created._id}`);
    await settle();

    rec.mark('server');
    await admin.ok('PATCH', `/servers/${s}`, { description: 'Tallennuksen aikana muutettu kuvaus.' });
    await settle();
    await admin.ok('PATCH', `/servers/${s}`, { description: 'Concordin kehityspalvelin. The Concord development server.' });
    await settle();

    rec.mark('role');
    const role = await admin.ok<{ id: string }>('POST', `/servers/${s}/roles`, { name: 'Tallentaja', rank: 10 });
    await settle();
    await admin.ok('PATCH', `/servers/${s}/roles/${role.id}`, { colour: '#1fb6d1', hoist: false });
    await settle();
    await admin.ok('DELETE', `/servers/${s}/roles/${role.id}`);
    await settle();

    rec.mark('member');
    const pekka = await client(rec, state, 'pekka');
    await admin.ok('DELETE', `/servers/${s}/members/${state.personas.pekka!.userId}`);
    await settle();
    await pekka.ok('POST', `/invites/${state.inviteCode}`);
    await settle();
    await admin.ok('PATCH', `/servers/${s}/members/${state.personas.pekka!.userId}`, { nickname: 'Pekka O.' });
    await settle();
    await admin.ok('PATCH', `/servers/${s}/members/${state.personas.pekka!.userId}`, { remove: ['Nickname'] });
    await settle();

    rec.mark('emoji');
    const form = new FormData();
    form.append('file', new Blob([emojiShape(new Rng(77), 3) as Uint8Array<ArrayBuffer>], { type: 'image/png' }), 'tallennus.png');
    const up = await fetch(`${BACKEND}/autumn/emojis`, { method: 'POST', headers: { 'x-session-token': admin.token }, body: form });
    const { id } = (await up.json()) as { id: string };
    await admin.ok('PUT', `/custom/emoji/${id}`, { name: 'tallennus', parent: { type: 'Server', id: s } });
    await settle();
    await admin.ok('DELETE', `/custom/emoji/${id}`);
    await settle();

    rec.mark('relationship');
    const mikko = await client(rec, state, 'mikko');
    const devId = state.personas.dev!.userId;
    const mikkoId = state.personas.mikko!.userId;
    await mikko.ok('PUT', `/users/${devId}/friend`);
    await settle();
    await dev.ok('DELETE', `/users/${mikkoId}/friend`);
    await settle();
    await dev.ok('POST', '/users/friend', { username: state.personas.mikko!.username });
    await settle();

    rec.mark('ack');
    const [last] = await dev.ok<{ _id: string }[]>('GET', `/channels/${ch}/messages?limit=1`);
    await dev.ok('PUT', `/channels/${ch}/ack/${last!._id}`);
    await settle();
    socket.close();
    await sleep(300);
  },
};

async function main() {
  const args = process.argv.slice(2);
  const scrubOnly = args.includes('--scrub-only');
  const spreadAt = args.indexOf('--spread-days');
  const spreadDays = spreadAt >= 0 ? Number(args[spreadAt + 1]) : undefined;
  const chosen = args.filter((a, i) => !a.startsWith('--') && (spreadAt < 0 || i !== spreadAt + 1));
  const state = loadState();
  if (!state) throw new Error('no seed state: run `pnpm seed --reset` first');
  extraSecrets.add(state.inviteCode);

  const root = await new Client(live).ok<{ revolt: string; build?: { commit_sha?: string } }>('GET', '/');
  const outDir = join(FIXTURES, root.revolt);

  if (!scrubOnly) {
    const names = chosen.length ? chosen : Object.keys(scenarios);
    for (const name of names) {
      const fn = scenarios[name];
      if (!fn) throw new Error(`unknown scenario ${name}; known: ${Object.keys(scenarios).join(', ')}`);
      rmSync(join(RAW, name), { recursive: true, force: true });
      console.log(`recording ${name}`);
      await fn(new Recording(RAW, name), state);
    }
    const secretsFile = join(RAW, 'extra-secrets.json');
    const known = existsSync(secretsFile) ? (JSON.parse(readFileSync(secretsFile, 'utf8')) as string[]) : [];
    mkdirSync(RAW, { recursive: true });
    writeFileSync(secretsFile, JSON.stringify([...new Set([...known, ...extraSecrets])]));
  }

  const secretsFile = join(RAW, 'extra-secrets.json');
  const extra = existsSync(secretsFile) ? (JSON.parse(readFileSync(secretsFile, 'utf8')) as string[]) : [...extraSecrets];
  const { files } = scrubAll({ rawDir: RAW, outDir, inviteCodes: extra, ...(spreadDays ? { spreadDays } : {}) });
  const seedHash = createHash('sha256').update(readFileSync(join(SEED_DIR, 'src', 'data.ts'))).digest('hex').slice(0, 16);
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify({
    stoat: root.revolt, build: root.build?.commit_sha ?? null, scrubRules: SCRUB_RULES_VERSION, seedHash,
    spreadDays: spreadDays ?? 0, scenarios: readdirSync(outDir).filter((d) => d !== 'manifest.json').sort(),
  }, null, 2) + '\n');
  console.log(`wrote ${files} fixture files to ${outDir}`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.stack : e);
  process.exit(1);
});
