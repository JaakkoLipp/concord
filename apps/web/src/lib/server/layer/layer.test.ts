import { describe, expect, it } from 'vitest';
import { Permission } from '@concord/domain';
import { Layer, LIMITS, configFrom } from './layer.ts';
import { MIGRATIONS } from './migrations.ts';
import { openStore } from './store.ts';
import { requireId, requireText, visibleLength } from './input.ts';
import { LayerError } from './util.ts';

const ALICE = '01HZZZZZZZZZZZZZZZZZZZAAAA';
const BOB = '01HZZZZZZZZZZZZZZZZZZZZBBB';
const ADMIN = '01HZZZZZZZZZZZZZZZZZZADM1N';
const SERVER = '01HZZZZZZZZZZZZZZZZZSERWER';
const MOD_ROLE = '01HZZZZZZZZZZZZZZZZZZZZM0D';
const ADDRESS = '203.0.113.7';

/** A fake Stoat: tokens map to users, and every request is recorded. `fail` makes it answer like a broken Stoat. */
function fakeStoat() {
  const s = {
    tokens: new Map<string, string>([['alice-token', ALICE], ['bob-token', BOB], ['admin-token', ADMIN]]),
    creators: [ADMIN] as string[],
    members: new Map<string, string[]>([[ALICE, [MOD_ROLE]], [BOB, []]]),
    fail: null as null | 'down' | 'slow' | 500 | 429,
    calls: [] as string[],
    fetch: async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = new URL(String(input));
      const token = new Headers(init?.headers).get('x-session-token');
      s.calls.push(url.pathname);
      if (s.fail === 'down') throw new TypeError('fetch failed');
      if (s.fail === 'slow') throw new DOMException('timed out', 'TimeoutError');
      if (s.fail === 500) return new Response('oops', { status: 500 });
      if (s.fail === 429) return new Response('{"retry_after":3000}', { status: 429, headers: { 'x-ratelimit-reset-after': '3000' } });
      const ok = (body: unknown) => Response.json(body);
      if (url.pathname === '/') return ok({ revolt: '0.15.5', features: { limits: { global: { restrict_server_creation: s.creators } } } });
      const user = token ? s.tokens.get(token) : undefined;
      if (!user) return new Response('<html>401</html>', { status: 401 });
      if (url.pathname === '/users/@me') return ok({ _id: user, username: 'x' });
      if (url.pathname === `/servers/${SERVER}`) {
        if (!s.members.has(user) && user !== ADMIN) return Response.json({ type: 'NotFound' }, { status: 404 });
        return ok({
          _id: SERVER, owner: ADMIN, name: 'S', channels: [], default_permissions: 0,
          roles: { [MOD_ROLE]: { name: 'Mod', permissions: { a: Number(Permission.ManageServer), d: 0 }, rank: 1 } },
        });
      }
      const m = /^\/servers\/\w+\/members\/(\w+)$/.exec(url.pathname);
      if (m) {
        const roles = s.members.get(m[1]!);
        if (!roles) return Response.json({ type: 'NotFound' }, { status: 404 });
        return ok({ _id: { server: SERVER, user: m[1] }, joined_at: '2026-01-01T00:00:00Z', roles });
      }
      return new Response('', { status: 404 });
    },
  };
  return s;
}

function setup(env: Record<string, string> = { ADMIN_USER_IDS: ADMIN }) {
  const stoat = fakeStoat();
  const clock = { t: 1_000_000 };
  const layer = new Layer(configFrom(env, { stoatApi: 'http://api:14702' }), openStore(':memory:', MIGRATIONS), {
    fetch: stoat.fetch as typeof fetch,
    now: () => clock.t,
  });
  return { layer, stoat, clock };
}

async function refusal(p: Promise<unknown> | (() => unknown)): Promise<LayerError> {
  try {
    await (typeof p === 'function' ? p() : p);
  } catch (e) {
    if (e instanceof LayerError) return e;
    throw e;
  }
  throw new Error('expected a refusal');
}

describe('the session check', () => {
  it('refuses a missing token without asking Stoat', async () => {
    const { layer, stoat } = setup();
    expect((await refusal(layer.authenticate(null, ADDRESS))).status).toBe(401);
    expect((await refusal(layer.authenticate('', ADDRESS))).status).toBe(401);
    expect((await refusal(layer.authenticate('x'.repeat(1000), ADDRESS))).status).toBe(401);
    expect(stoat.calls).toEqual([]);
  });

  it('accepts a good token and caches it for 60 s', async () => {
    const { layer, stoat, clock } = setup();
    expect(await layer.authenticate('alice-token', ADDRESS)).toEqual({ id: ALICE, token: 'alice-token' });
    clock.t += LIMITS.goodSessionMs - 1;
    await layer.authenticate('alice-token', ADDRESS);
    expect(stoat.calls).toEqual(['/users/@me']);
    clock.t += 2;
    await layer.authenticate('alice-token', ADDRESS);
    expect(stoat.calls).toEqual(['/users/@me', '/users/@me']);
  });

  it('refuses a bad token with 401 and caches that for 10 s', async () => {
    const { layer, stoat, clock } = setup();
    const e = await refusal(layer.authenticate('nope', ADDRESS));
    expect([e.status, e.type]).toEqual([401, 'InvalidSession']);
    await refusal(layer.authenticate('nope', ADDRESS));
    expect(stoat.calls).toHaveLength(1);
    clock.t += LIMITS.badSessionMs;
    await refusal(layer.authenticate('nope', ADDRESS));
    expect(stoat.calls).toHaveLength(2);
  });

  it('refuses a token Stoat has since revoked, once the cache runs out', async () => {
    const { layer, stoat, clock } = setup();
    await layer.authenticate('alice-token', ADDRESS);
    stoat.tokens.delete('alice-token');
    clock.t += LIMITS.goodSessionMs;
    expect((await refusal(layer.authenticate('alice-token', ADDRESS))).status).toBe(401);
  });

  it.each(['down', 'slow', 500] as const)('answers 503, never 401, when Stoat is %s, and caches nothing', async (fail) => {
    const { layer, stoat } = setup();
    stoat.fail = fail;
    const e = await refusal(layer.authenticate('alice-token', ADDRESS));
    expect([e.status, e.type]).toEqual([503, 'StoatUnavailable']);
    stoat.fail = null;
    expect((await layer.authenticate('alice-token', ADDRESS)).id).toBe(ALICE);
  });

  it('passes Stoat’s 429 on as a 429, never a 401', async () => {
    const { layer, stoat } = setup();
    stoat.fail = 429;
    const e = await refusal(layer.authenticate('alice-token', ADDRESS));
    expect([e.status, e.extra.retry_after]).toEqual([429, 3000]);
  });

  it('shares one Stoat call between concurrent checks of the same token', async () => {
    const { layer, stoat } = setup();
    const callers = await Promise.all([1, 2, 3, 4, 5].map(() => layer.authenticate('alice-token', ADDRESS)));
    expect(callers.every((c) => c.id === ALICE)).toBe(true);
    expect(stoat.calls).toEqual(['/users/@me']);
  });

  it('limits lookups of unknown tokens per address before any Stoat call', async () => {
    const { layer, stoat } = setup();
    for (let i = 0; i < LIMITS.addressLookups; i++) await refusal(layer.authenticate(`random-${i}`, ADDRESS));
    const e = await refusal(layer.authenticate('random-x', ADDRESS));
    expect([e.status, e.extra.limit]).toEqual([429, 'address']);
    expect(stoat.calls).toHaveLength(LIMITS.addressLookups);
    // Another address is unaffected.
    await refusal(layer.authenticate('random-y', '198.51.100.1'));
    expect(stoat.calls).toHaveLength(LIMITS.addressLookups + 1);
  });

  it('lets a recently good token past a flooded address', async () => {
    const { layer, clock } = setup();
    await layer.authenticate('alice-token', ADDRESS);
    // Alice's 60 s entry runs out, then the address is flooded before she checks again.
    clock.t += LIMITS.goodSessionMs;
    for (let i = 0; i < LIMITS.addressLookups + 5; i++) await refusal(layer.authenticate(`random-${i}`, ADDRESS));
    expect((await layer.authenticate('alice-token', ADDRESS)).id).toBe(ALICE);
    expect((await refusal(layer.authenticate('bob-token', ADDRESS))).status).toBe(429);
  });
});

describe('the gates', () => {
  it('passes the admin and the server creator', async () => {
    const { layer } = setup();
    const admin = await layer.authenticate('admin-token', ADDRESS);
    expect(await layer.gates(admin)).toEqual({ admin: true, serverCreator: true });
    expect(layer.requireAdmin(admin)).toBeUndefined();
    await layer.requireServerCreator(admin);
  });

  it('answers 404 to a non-admin and 403 to a non-creator', async () => {
    const { layer } = setup();
    const alice = await layer.authenticate('alice-token', ADDRESS);
    expect(await layer.gates(alice)).toEqual({ admin: false, serverCreator: false });
    expect((await refusal(() => layer.requireAdmin(alice))).status).toBe(404);
    const e = await refusal(layer.requireServerCreator(alice));
    expect([e.status, e.type]).toEqual([403, 'NotServerCreator']);
  });

  it('fails closed on an empty admin list and an empty creator list', async () => {
    const { layer, stoat } = setup({});
    stoat.creators = [];
    const admin = await layer.authenticate('admin-token', ADDRESS);
    expect(await layer.gates(admin)).toEqual({ admin: false, serverCreator: false });
  });

  it('refuses to start with an admin list that isn’t user IDs', () => {
    expect(() => configFrom({ ADMIN_USER_IDS: `${ADMIN}, someone@example.com` }, { stoatApi: '' })).toThrow(/aren't user IDs/);
    expect([...configFrom({ ADMIN_USER_IDS: ` ${ADMIN},${ALICE} ` }, { stoatApi: '' }).adminIds]).toEqual([ADMIN, ALICE]);
  });

  it('reads the creator list once a minute', async () => {
    const { layer, stoat, clock } = setup();
    const admin = await layer.authenticate('admin-token', ADDRESS);
    await layer.gates(admin);
    await layer.gates(admin);
    expect(stoat.calls.filter((c) => c === '/')).toHaveLength(1);
    clock.t += LIMITS.serverCreatorsMs;
    await layer.gates(admin);
    expect(stoat.calls.filter((c) => c === '/')).toHaveLength(2);
  });
});

describe('the permission check', () => {
  const MANAGE = Permission.ManageServer;

  it('grants a role’s permission with at most two Stoat calls, then answers from cache for 30 s', async () => {
    const { layer, stoat, clock } = setup();
    const alice = await layer.authenticate('alice-token', ADDRESS);
    stoat.calls = [];
    await layer.requirePermission(alice, SERVER, MANAGE, 'ManageServer');
    expect(stoat.calls).toHaveLength(2);
    await layer.requirePermission(alice, SERVER, MANAGE, 'ManageServer');
    expect(stoat.calls).toHaveLength(2);
    clock.t += LIMITS.permissionsMs;
    await layer.requirePermission(alice, SERVER, MANAGE, 'ManageServer');
    expect(stoat.calls).toHaveLength(4);
  });

  it('gives the owner everything with one call', async () => {
    const { layer, stoat } = setup();
    const admin = await layer.authenticate('admin-token', ADDRESS);
    stoat.calls = [];
    await layer.requirePermission(admin, SERVER, MANAGE, 'ManageServer');
    expect(stoat.calls).toEqual([`/servers/${SERVER}`]);
  });

  it('refuses a member without the permission, and a non-member', async () => {
    const { layer } = setup();
    const bob = await layer.authenticate('bob-token', ADDRESS);
    const e = await refusal(layer.requirePermission(bob, SERVER, MANAGE, 'ManageServer'));
    expect([e.status, e.type, e.extra.permission]).toEqual([403, 'MissingPermission', 'ManageServer']);
    const other = setup();
    other.stoat.members.delete(BOB);
    const outsider = await other.layer.authenticate('bob-token', ADDRESS);
    expect(await other.layer.serverPermissions(outsider, SERVER)).toBe(0n);
  });

  it('caches nothing when Stoat fails mid-check', async () => {
    const { layer, stoat } = setup();
    const alice = await layer.authenticate('alice-token', ADDRESS);
    stoat.fail = 500;
    expect((await refusal(layer.serverPermissions(alice, SERVER))).status).toBe(503);
    stoat.fail = null;
    await layer.requirePermission(alice, SERVER, MANAGE, 'ManageServer');
  });
});

describe('the per-user limits', () => {
  it('counts reads and writes apart, per user, per minute', async () => {
    const { layer, clock } = setup();
    const alice = await layer.authenticate('alice-token', ADDRESS);
    const bob = await layer.authenticate('bob-token', ADDRESS);
    for (let i = 0; i < LIMITS.writes; i++) layer.limit(alice, 'write');
    const e = await refusal(() => layer.limit(alice, 'write'));
    expect([e.status, e.extra.limit]).toEqual([429, 'write']);
    expect(e.extra.retry_after).toBeGreaterThan(0);
    layer.limit(alice, 'read');
    layer.limit(bob, 'write');
    clock.t += LIMITS.userWindowMs;
    layer.limit(alice, 'write');
  });
});

describe('the input checks', () => {
  it('accepts only the ULID shape', async () => {
    expect(requireId(SERVER)).toBe(SERVER);
    for (const bad of ['', '../users/@me', `${SERVER}/members`, SERVER.toLowerCase(), `${SERVER}?x=1`, 'O'.repeat(26), null, 5]) {
      expect((await refusal(() => requireId(bad))).type).toBe('InvalidId');
    }
  });

  it('normalises text and counts what people see', async () => {
    expect(requireText('  Café ', { max: 4 })).toBe('Café');
    expect(visibleLength('👩‍👩‍👧‍👦🇫🇮')).toBe(2);
    expect(requireText('👩‍👩‍👧‍👦🇫🇮', { max: 2 })).toBe('👩‍👩‍👧‍👦🇫🇮');
    for (const bad of ['ABCDE', '', '   ', 'a\u0000b', 'a‮b', 'a​b', 7]) {
      expect((await refusal(() => requireText(bad, { max: 4 }))).type).toBe('InvalidText');
    }
    expect(requireText('', { max: 4, min: 0 })).toBe('');
  });
});
