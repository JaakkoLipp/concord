/**
 * Server invites on request (serverInvites.ts): a member asks, an admin approves with the code of an invite they made,
 * and a moderator who may invite there skips the queue.
 */
import { describe, expect, it } from 'vitest';
import { Permission } from '@concord/domain';
import { Layer, configFrom, type Caller } from './layer.ts';
import { MIGRATIONS } from './migrations.ts';
import { openStore } from './store.ts';
import { listServerInvites, requestServerInvite, reviewServerInvite } from './serverInvites.ts';
import { LayerError } from './util.ts';

const ADMIN = '01HZZZZZZZZZZZZZZZZZZADM1N';
const MOD = '01HZZZZZZZZZZZZZZZZZZZZM0D';
const MEMBER = '01HZZZZZZZZZZZZZZZZZZZZBBB';
const OUTSIDER = '01HZZZZZZZZZZZZZZZZZZZZ00X';
const SERVER = '01HZZZZZZZZZZZZZZZZZSERWER';
const OTHER = '01HZZZZZZZZZZZZZZZZZZZZ0TH';
const INVITER = '01HZZZZZZZZZZZZZZZZZZZZR0L';

/** A fake Stoat: ADMIN owns the server, MOD has a role that may invite, MEMBER only sees it, OUTSIDER isn't in it. */
function fakeStoat() {
  const s = {
    creators: [MOD] as string[],
    fetch: async (input: string | URL | Request): Promise<Response> => {
      const url = new URL(String(input));
      if (url.pathname === '/') return Response.json({ revolt: '0.15.5', features: { limits: { global: { restrict_server_creation: s.creators } } } });
      if (url.pathname === `/servers/${SERVER}`) {
        return Response.json({
          _id: SERVER, owner: ADMIN, name: 'S', channels: [], default_permissions: Number(Permission.ViewChannel),
          roles: { [INVITER]: { name: 'Inviter', permissions: { a: Number(Permission.InviteOthers), d: 0 }, rank: 1 } },
        });
      }
      const m = /^\/servers\/\w+\/members\/(\w+)$/.exec(url.pathname);
      if (m) {
        const roles = m[1] === MOD ? [INVITER] : m[1] === MEMBER ? [] : null;
        if (!roles) return Response.json({ type: 'NotFound' }, { status: 404 });
        return Response.json({ _id: { server: SERVER, user: m[1] }, joined_at: '2026-01-01T00:00:00Z', roles });
      }
      return new Response('', { status: 404 });
    },
  };
  return s;
}

function setup() {
  const layer = new Layer(configFrom({ ADMIN_USER_IDS: ADMIN }, { stoatApi: 'http://api:14702' }), openStore(':memory:', MIGRATIONS), {
    fetch: fakeStoat().fetch as typeof fetch,
    now: Date.now,
  });
  return layer;
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

describe('asking for a server invite', () => {
  it('queues a member’s request, without a code', async () => {
    const layer = setup();
    const asked = await requestServerInvite(layer, caller(MEMBER), SERVER, '  for Aino  ');
    expect([asked.status, asked.code, asked.note, asked.server]).toEqual(['pending', null, 'for Aino', SERVER]);
  });

  it('is only for people in the server', async () => {
    const layer = setup();
    expect((await refusal(requestServerInvite(layer, caller(OUTSIDER), SERVER, ''))).status).toBe(403);
    expect((await refusal(requestServerInvite(layer, caller(MEMBER), 'not-an-id', ''))).type).toBe('InvalidId');
    expect((await refusal(requestServerInvite(layer, caller(MEMBER), OTHER, ''))).status).toBe(403);
  });

  it('limits the note, and 10 requests a day', async () => {
    const layer = setup();
    expect((await refusal(requestServerInvite(layer, caller(MEMBER), SERVER, 'x'.repeat(81)))).type).toBe('InvalidText');
    for (let i = 0; i < 10; i++) await requestServerInvite(layer, caller(MEMBER), SERVER, `n${i}`);
    expect((await refusal(requestServerInvite(layer, caller(MEMBER), SERVER, 'more'))).type).toBe('InvitationLimit');
  });

  it('lets a moderator who may invite skip review with their invite’s code, and nobody else', async () => {
    const layer = setup();
    const direct = await requestServerInvite(layer, caller(MOD), SERVER, '', 'AbC12345');
    expect([direct.status, direct.code]).toEqual(['approved', 'AbC12345']);
    expect((await refusal(requestServerInvite(layer, caller(MEMBER), SERVER, '', 'AbC12345'))).type).toBe('NotServerCreator');
    expect((await refusal(requestServerInvite(layer, caller(MOD), SERVER, '', 'bad code!'))).type).toBe('InvalidInvite');
    expect((await requestServerInvite(layer, caller(MOD), SERVER, 'asks anyway')).status).toBe('pending');
  });
});

describe('reviewing and listing', () => {
  it('lists your own, and everyone’s only for an admin', async () => {
    const layer = setup();
    await requestServerInvite(layer, caller(MEMBER), SERVER, 'one');
    await requestServerInvite(layer, caller(MOD), SERVER, '', 'AbC12345');
    expect(listServerInvites(layer, caller(MEMBER), false)).toHaveLength(1);
    expect(listServerInvites(layer, caller(ADMIN), true)).toHaveLength(2);
    expect((await refusal(() => listServerInvites(layer, caller(MEMBER), true))).status).toBe(404);
  });

  it('approves with a code once, and shows it to the requester', async () => {
    const layer = setup();
    const asked = await requestServerInvite(layer, caller(MEMBER), SERVER, 'for Aino');
    expect((await refusal(reviewServerInvite(layer, caller(MEMBER), asked.id, true, 'AbC12345'))).status).toBe(404);
    expect((await refusal(reviewServerInvite(layer, caller(ADMIN), asked.id, true))).type).toBe('InvalidInvite');
    await reviewServerInvite(layer, caller(ADMIN), asked.id, true, 'AbC12345');
    expect(listServerInvites(layer, caller(MEMBER), false)[0]).toMatchObject({ status: 'approved', code: 'AbC12345' });
    expect((await refusal(reviewServerInvite(layer, caller(ADMIN), asked.id, true, 'Other123'))).type).toBe('InvitationChanged');
  });

  it('declines without a code', async () => {
    const layer = setup();
    const asked = await requestServerInvite(layer, caller(MEMBER), SERVER, '');
    await reviewServerInvite(layer, caller(ADMIN), asked.id, false, 'ignored1');
    expect(listServerInvites(layer, caller(MEMBER), false)[0]).toMatchObject({ status: 'declined', code: null });
  });
});
