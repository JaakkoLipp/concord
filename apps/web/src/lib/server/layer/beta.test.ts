/**
 * The closed-beta invitation rules (beta.ts): who may request, who approves, how links rotate and how a
 * redeem claims an address exactly once, failing closed when Stoat's answer is ambiguous.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emailAddress, invitationLink, listInvitations, redeemInvitation, requestInvitation, reviewInvitation } from './beta.ts';
import { Layer, configFrom, type Caller } from './layer.ts';
import { MIGRATIONS } from './migrations.ts';
import { openStore } from './store.ts';
import { LayerError } from './util.ts';

const ADMIN = '01HZZZZZZZZZZZZZZZZZZADM1N';
const MOD = '01HZZZZZZZZZZZZZZZZZZZZM0D';
const MEMBER = '01HZZZZZZZZZZZZZZZZZZZZBBB';
const BASE = 1_700_000_000_000;
const WEEK = 7 * 24 * 60 * 60_000;
const EMAIL = 'friend@example.com';
const PASSWORD = 'correct horse battery';

afterEach(() => vi.useRealTimers());

/** A fake Stoat: the creator list, and account creation the tests can make fail or hold open. */
function fakeStoat() {
  const s = {
    creators: [ADMIN, MOD] as string[],
    accounts: [] as { email: string; password: string }[],
    onCreate: (email: string, password: string): Response | Promise<Response> => {
      s.accounts.push({ email, password });
      return new Response(null, { status: 204 });
    },
    fetch: async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = new URL(String(input));
      if (url.pathname === '/') return Response.json({ revolt: '0.15.5', features: { limits: { global: { restrict_server_creation: s.creators } } } });
      if (url.pathname === '/auth/account/create') {
        const body = JSON.parse(String(init?.body ?? '{}')) as { email: string; password: string };
        return s.onCreate(body.email, body.password);
      }
      return new Response('', { status: 404 });
    },
  };
  return s;
}

function setup(env: Record<string, string> = { ADMIN_USER_IDS: ADMIN }) {
  vi.useFakeTimers();
  vi.setSystemTime(BASE);
  const stoat = fakeStoat();
  const layer = new Layer(configFrom(env, { stoatApi: 'http://api:14702' }), openStore(':memory:', MIGRATIONS), {
    fetch: stoat.fetch as typeof fetch,
    now: Date.now,
  });
  return { layer, stoat };
}

const caller = (id: string): Caller => ({ id, token: `${id}` });
const admin = () => caller(ADMIN);
const mod = () => caller(MOD);
const member = () => caller(MEMBER);

async function refusal(p: Promise<unknown> | (() => unknown)): Promise<LayerError> {
  try {
    await (typeof p === 'function' ? p() : p);
  } catch (e) {
    if (e instanceof LayerError) return e;
    throw e;
  }
  throw new Error('expected a refusal');
}

describe('emails', () => {
  it('lowercases and trims, and refuses anything that is not one', () => {
    expect(emailAddress(' Friend@Example.COM ')).toBe('friend@example.com');
    for (const bad of ['', 'nope', 'a b@x.com', '@x.com', 'a@x', `${'x'.repeat(250)}@x.com`, 'a@x.com\u0000', 5, undefined, null]) {
      expect(() => emailAddress(bad)).toThrow(LayerError);
    }
  });
});

describe('requesting an invitation', () => {
  it('sends a plain member to review, and gives moderators and admins an approved week', async () => {
    const { layer } = setup();
    const pending = await requestInvitation(layer, member(), EMAIL);
    expect([pending.status, pending.expiresAt]).toEqual(['pending', null]);
    const direct = await requestInvitation(layer, mod(), 'Mod@Example.com');
    expect([direct.status, direct.expiresAt]).toEqual(['approved', BASE + WEEK]);
    expect(direct.email).toBe('mod@example.com');
    expect((await requestInvitation(layer, admin(), 'Admin@Example.com')).status).toBe('approved');
  });

  it('refuses a second open invitation for the same address, whatever its status', async () => {
    const { layer } = setup();
    await requestInvitation(layer, member(), EMAIL);
    expect((await refusal(requestInvitation(layer, member(), 'FRIEND@example.com'))).type).toBe('InvitationPending');
    const db = layer.store;
    db.prepare("UPDATE beta_invitations SET status = 'claiming'").run();
    expect((await refusal(requestInvitation(layer, member(), EMAIL))).type).toBe('InvitationPending');
  });

  it('lets an expired approval go and the address be requested again', async () => {
    const { layer } = setup();
    const first = await requestInvitation(layer, mod(), EMAIL);
    vi.setSystemTime(BASE + WEEK + 1);
    const second = await requestInvitation(layer, mod(), EMAIL);
    const rows = listInvitations(layer, admin(), true);
    expect(rows.map((r) => r.id)).toEqual([second.id, first.id]);
    expect(rows[1]!.status).toBe('declined');
  });

  it('counts against the requester: 10 in a day, then 429', async () => {
    const { layer } = setup();
    for (let i = 0; i < 10; i++) await requestInvitation(layer, member(), `friend${i}@example.com`);
    expect((await refusal(requestInvitation(layer, member(), 'friend10@example.com'))).type).toBe('InvitationLimit');
    expect((await requestInvitation(layer, caller(ADMIN), 'friend@example.com')).status).toBe('approved');
    vi.setSystemTime(BASE + 24 * 60 * 60_000 + 1);
    expect((await requestInvitation(layer, member(), 'friend10@example.com')).status).toBe('pending');
  });
});

describe('reviewing and listing', () => {
  it('lists only your own unless an admin asks for review', async () => {
    const { layer } = setup();
    await requestInvitation(layer, member(), 'one@example.com');
    vi.setSystemTime(BASE + 1);
    await requestInvitation(layer, admin(), 'two@example.com');
    expect(listInvitations(layer, member(), false).map((r) => r.email)).toEqual(['one@example.com']);
    expect(listInvitations(layer, admin(), true).map((r) => r.email)).toEqual(['two@example.com', 'one@example.com']);
    expect((await refusal(() => listInvitations(layer, member(), true))).status).toBe(404);
  });

  it('approves and declines pending rows, once', async () => {
    const { layer } = setup();
    const a = await requestInvitation(layer, member(), 'a@example.com');
    const b = await requestInvitation(layer, member(), 'b@example.com');
    reviewInvitation(layer, admin(), a.id, true);
    reviewInvitation(layer, admin(), b.id, false);
    const rows = new Map(listInvitations(layer, admin(), true).map((r) => [r.id, r]));
    expect([rows.get(a.id)!.status, rows.get(a.id)!.expiresAt]).toEqual(['approved', BASE + WEEK]);
    expect(rows.get(b.id)!.status).toBe('declined');
    expect((await refusal(() => reviewInvitation(layer, admin(), a.id, true))).type).toBe('InvitationChanged');
    expect((await refusal(() => reviewInvitation(layer, member(), b.id, true))).status).toBe(404);
  });
});

describe('invite links', () => {
  it('is 43 characters, belongs to the requester or an admin, and needs an approved row', async () => {
    const { layer } = setup();
    const pending = await requestInvitation(layer, member(), EMAIL);
    expect((await refusal(() => invitationLink(layer, member(), pending.id))).type).toBe('InvalidInvitation');
    expect((await refusal(() => invitationLink(layer, admin(), pending.id))).type).toBe('InvalidInvitation');
    reviewInvitation(layer, admin(), pending.id, true);
    const token = invitationLink(layer, member(), pending.id);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(invitationLink(layer, admin(), pending.id)).toHaveLength(43);
    const other = await requestInvitation(layer, member(), 'other@example.com');
    expect((await refusal(() => invitationLink(layer, member(), other.id))).type).toBe('InvalidInvitation');
  });

  it('rotates: a new link stops the old one', async () => {
    const { layer, stoat } = setup();
    const invite = await requestInvitation(layer, mod(), EMAIL);
    const first = invitationLink(layer, mod(), invite.id);
    const second = invitationLink(layer, mod(), invite.id);
    expect((await refusal(redeemInvitation(layer, first, EMAIL, PASSWORD))).type).toBe('InvalidInvitation');
    await redeemInvitation(layer, second, EMAIL, PASSWORD);
    expect(stoat.accounts).toEqual([{ email: EMAIL, password: PASSWORD }]);
  });
});

describe('redeeming', () => {
  async function approved() {
    const { layer, stoat } = setup();
    const invite = await requestInvitation(layer, mod(), EMAIL);
    return { layer, stoat, invite, token: invitationLink(layer, mod(), invite.id) };
  }

  it('creates the account once, through Stoat, and burns the token', async () => {
    const { layer, stoat, token } = await approved();
    await redeemInvitation(layer, token, EMAIL, PASSWORD);
    expect(stoat.accounts).toEqual([{ email: EMAIL, password: PASSWORD }]);
    const row = layer.store.prepare('SELECT status, token_hash AS hash FROM beta_invitations').get() as { status: string; hash: string | null };
    expect([row.status, row.hash]).toEqual(['used', null]);
    expect((await refusal(redeemInvitation(layer, token, EMAIL, PASSWORD))).type).toBe('InvalidInvitation');
  });

  it('refuses a bad token shape, a bad email, a short password, and a mismatched email', async () => {
    const { layer, token } = await approved();
    expect((await refusal(redeemInvitation(layer, 'short', EMAIL, PASSWORD))).type).toBe('InvalidInvitation');
    expect((await refusal(redeemInvitation(layer, token, 'not an email', PASSWORD))).type).toBe('InvalidEmail');
    expect((await refusal(redeemInvitation(layer, token, EMAIL, 'short'))).type).toBe('ShortPassword');
    expect((await refusal(redeemInvitation(layer, token, 'other@example.com', PASSWORD))).type).toBe('InvalidInvitation');
  });

  it('claims before the account call, so two submits create one account', async () => {
    const { layer, stoat, token } = await approved();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const real = stoat.onCreate;
    stoat.onCreate = async (email, password) => {
      await gate;
      return real(email, password);
    };
    const both = [redeemInvitation(layer, token, EMAIL, PASSWORD), redeemInvitation(layer, token, EMAIL, PASSWORD)];
    release();
    const results = await Promise.allSettled(both);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(stoat.accounts).toHaveLength(1);
  });

  it('keeps the link when Stoat only refuses the password, and clears it when the outcome is unknown', async () => {
    const { layer, stoat, token } = await approved();
    stoat.onCreate = () => Response.json({ type: 'CompromisedPassword' }, { status: 400 });
    expect((await refusal(redeemInvitation(layer, token, EMAIL, PASSWORD))).type).toBe('CompromisedPassword');
    expect((layer.store.prepare('SELECT status FROM beta_invitations').get() as { status: string }).status).toBe('approved');
    stoat.onCreate = (email, password) => {
      stoat.accounts.push({ email, password });
      return new Response(null, { status: 204 });
    };
    await redeemInvitation(layer, token, EMAIL, PASSWORD);
    expect((layer.store.prepare('SELECT status FROM beta_invitations').get() as { status: string }).status).toBe('used');
  });

  it('fails closed when Stoat errors or has the account already, and the link is gone', async () => {
    const { layer, stoat, token } = await approved();
    stoat.onCreate = () => Response.json({ type: 'AccountExists' }, { status: 409 });
    expect((await refusal(redeemInvitation(layer, token, EMAIL, PASSWORD))).type).toBe('AccountExists');
    const row = layer.store.prepare('SELECT status, token_hash AS hash FROM beta_invitations').get() as { status: string; hash: string | null };
    expect([row.status, row.hash]).toEqual(['failed', null]);
    expect((await refusal(redeemInvitation(layer, token, EMAIL, PASSWORD))).type).toBe('InvalidInvitation');
  });

  it('maps Stoat being down to 503 and spends the invitation', async () => {
    const { layer, stoat, token } = await approved();
    stoat.onCreate = () => new Response('oops', { status: 500 });
    expect((await refusal(redeemInvitation(layer, token, EMAIL, PASSWORD))).type).toBe('InvitationNeedsHelp');
    expect((layer.store.prepare('SELECT status FROM beta_invitations').get() as { status: string }).status).toBe('failed');
  });
});
