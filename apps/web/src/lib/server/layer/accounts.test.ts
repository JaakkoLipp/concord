/**
 * The layer's side of the account runner (accounts.ts): who may ask, what a request looks like on disk, and how the
 * runner's answers are read back. The runner itself is exercised by tools/live/src/accounts.ts.
 */
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { accountActionResult, platformUsers, requestAccountAction } from './accounts.ts';
import { Layer, configFrom, type Caller } from './layer.ts';
import { MIGRATIONS } from './migrations.ts';
import { openStore } from './store.ts';
import { LayerError } from './util.ts';

const OWNER = '01HZZZZZZZZZZZZZZZZZZADM1N';
const ADMIN2 = '01HZZZZZZZZZZZZZZZZZZADM2N';
const MOD = '01HZZZZZZZZZZZZZZZZZZZZM0D';
const MEMBER = '01HZZZZZZZZZZZZZZZZZZZZBBB';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function setup(withSpool = true) {
  const dir = mkdtempSync(join(tmpdir(), 'spool-'));
  dirs.push(dir);
  mkdirSync(join(dir, 'in'));
  mkdirSync(join(dir, 'out'));
  const env: Record<string, string> = { ADMIN_USER_IDS: `${OWNER},${ADMIN2}`, ...(withSpool ? { SPOOL_DIR: dir } : {}) };
  const fetchFn = async (input: string | URL | Request): Promise<Response> => {
    if (new URL(String(input)).pathname === '/') return Response.json({ revolt: '0.15.5', features: { limits: { global: { restrict_server_creation: [MOD] } } } });
    return new Response('', { status: 404 });
  };
  const layer = new Layer(configFrom(env, { stoatApi: 'http://api:14702' }), openStore(':memory:', MIGRATIONS), { fetch: fetchFn as typeof fetch, now: Date.now });
  return { layer, dir };
}

const caller = (id: string): Caller => ({ id, token: `${id}-token` });

async function refusal(p: Promise<unknown> | (() => unknown)): Promise<LayerError> {
  try {
    await (typeof p === 'function' ? p() : p);
  } catch (e) {
    if (e instanceof LayerError) return e;
    throw e;
  }
  throw new Error('expected a refusal');
}

function users(dir: string, updatedAt = Date.now()) {
  writeFileSync(join(dir, 'out', 'users.json'), JSON.stringify({
    updatedAt,
    users: [
      { id: OWNER, username: 'owner', discriminator: '0001', disabled: false },
      { id: MOD, username: 'mod', discriminator: '0002', disabled: false },
      { id: MEMBER, username: 'member', discriminator: '0003', disabled: true },
    ],
  }));
}

describe('the user list', () => {
  it('adds the roles to the runner’s list, and marks the first admin as the owner', async () => {
    const { layer, dir } = setup();
    users(dir);
    const { users: list } = await platformUsers(layer, caller(OWNER));
    expect(list.map((u) => [u.username, u.admin, u.moderator, u.owner, u.disabled])).toEqual([
      ['owner', true, false, true, false],
      ['mod', false, true, false, false],
      ['member', false, false, false, true],
    ]);
  });

  it('is for admins only, and says so plainly when the runner isn’t answering', async () => {
    const { layer, dir } = setup();
    expect((await refusal(platformUsers(layer, caller(MEMBER)))).status).toBe(404);
    expect((await refusal(platformUsers(layer, caller(OWNER)))).type).toBe('RunnerUnavailable');
    users(dir, Date.now() - 10 * 60_000);
    expect((await refusal(platformUsers(layer, caller(OWNER)))).type).toBe('RunnerUnavailable');
    expect((await refusal(platformUsers(setup(false).layer, caller(OWNER)))).type).toBe('RunnerUnavailable');
  });
});

describe('asking the runner', () => {
  it('writes one small private request file, from the caller', () => {
    const { layer, dir } = setup();
    const { id } = requestAccountAction(layer, caller(OWNER), 'moderator:add', MEMBER);
    expect(readdirSync(join(dir, 'in'))).toEqual([`${id}.req.json`]);
    expect(JSON.parse(readFileSync(join(dir, 'in', `${id}.req.json`), 'utf8'))).toEqual({ action: 'moderator:add', user: MEMBER, by: OWNER });
    expect(statSync(join(dir, 'in', `${id}.req.json`)).mode & 0o777).toBe(0o600);
  });

  it('refuses anyone but an admin, a made-up action, and a bad ID, writing nothing', async () => {
    const { layer, dir } = setup();
    expect((await refusal(() => requestAccountAction(layer, caller(MEMBER), 'suspend', OWNER))).status).toBe(404);
    expect((await refusal(() => requestAccountAction(layer, caller(OWNER), 'delete-everything', MEMBER))).type).toBe('InvalidAction');
    expect((await refusal(() => requestAccountAction(layer, caller(OWNER), 'suspend', '../../etc'))).type).toBe('InvalidId');
    expect(readdirSync(join(dir, 'in'))).toEqual([]);
  });

  it('stops at 20 waiting requests', async () => {
    const { layer } = setup();
    for (let i = 0; i < 20; i++) requestAccountAction(layer, caller(OWNER), 'suspend', MEMBER);
    expect((await refusal(() => requestAccountAction(layer, caller(OWNER), 'suspend', MEMBER))).status).toBe(429);
  });

  it('answers pending until the runner has, then only the admin who asked sees the answer', async () => {
    const { layer, dir } = setup();
    const { id } = requestAccountAction(layer, caller(OWNER), 'password-link', MEMBER);
    expect(accountActionResult(layer, caller(OWNER), id)).toEqual({ status: 'pending' });
    writeFileSync(join(dir, 'out', `${id}.res.json`), JSON.stringify({ id, by: OWNER, status: 'ok', message: 'A link', link: 'http://x/app/welcome/abc' }));
    expect(accountActionResult(layer, caller(OWNER), id)).toEqual({ status: 'ok', message: 'A link', link: 'http://x/app/welcome/abc' });
    expect((await refusal(() => accountActionResult(layer, caller(ADMIN2), id))).status).toBe(404);
    expect((await refusal(() => accountActionResult(layer, caller(OWNER), '../users'))).type).toBe('InvalidId');
  });

  it('reads the moderator list again after a moderator change', async () => {
    const { layer, dir } = setup();
    expect(await layer.moderators()).toEqual([MOD]);
    const { id } = requestAccountAction(layer, caller(OWNER), 'moderator:remove', MOD);
    writeFileSync(join(dir, 'out', `${id}.res.json`), JSON.stringify({ id, by: OWNER, action: 'moderator:remove', status: 'ok', message: 'done' }));
    let reads = 0;
    const original = layer.stoat.serverCreators.bind(layer.stoat);
    layer.stoat.serverCreators = async () => { reads++; return original(); };
    await layer.moderators();
    expect(reads).toBe(0);
    accountActionResult(layer, caller(OWNER), id);
    await layer.moderators();
    expect(reads).toBe(1);
  });
});
