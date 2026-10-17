/** The account routes (M4.8 tasks 8 and 9), with bodies and tickets as probe 2 found them on Stoat 0.15.5. */
import { describe, expect, it } from 'vitest';
import { StoatBackend } from './backend.ts';
import type { HttpRequest, Transport } from './transport.ts';

const SESSION = '01M4WPBMZWYQ9GB009CG8FDEZA';

/** A backend over a fake transport that records each request and answers with `reply(request)`. */
function fake(reply: (r: HttpRequest) => unknown = () => null) {
  const requests: HttpRequest[] = [];
  const transport = {
    request: async (r: HttpRequest) => {
      requests.push(r);
      return { status: 200, headers: {}, body: reply(r) };
    },
  } as unknown as Transport;
  const backend = new StoatBackend(transport);
  backend.setToken('tok');
  const sent = () => requests.map(({ method, path, body, headers }) => ({ method, path, body, ticket: headers?.['x-mfa-ticket'] }));
  return { backend, sent };
}

describe('login', () => {
  it('names the session after the device and returns its ID', async () => {
    const { backend, sent } = fake(() => ({ result: 'Success', _id: SESSION, user_id: 'u', token: 't', name: 'n', last_seen: '' }));
    expect(await backend.login('a@b', 'pw', 'Concord on Firefox, Linux')).toEqual({ kind: 'session', token: 't', userId: 'u', sessionId: SESSION });
    await backend.loginMfa('tk', { totp: '123456' }, 'Concord on Firefox, Linux');
    expect(sent().map((r) => r.body)).toEqual([
      { email: 'a@b', password: 'pw', friendly_name: 'Concord on Firefox, Linux' },
      { mfa_ticket: 'tk', mfa_response: { totp_code: '123456' }, friendly_name: 'Concord on Firefox, Linux' },
    ]);
  });
});

describe('the account', () => {
  it('makes a ticket from each kind of proof', async () => {
    const { backend, sent } = fake(() => ({ _id: 'x', account_id: 'a', token: 'ticket', validated: true, authorised: false }));
    expect(await backend.mfaTicket({ password: 'pw' })).toBe('ticket');
    await backend.mfaTicket({ totp: '123456' });
    await backend.mfaTicket({ recovery: 'abcd-efgh' });
    expect(sent()).toEqual([
      { method: 'PUT', path: '/auth/mfa/ticket', body: { password: 'pw' }, ticket: undefined },
      { method: 'PUT', path: '/auth/mfa/ticket', body: { totp_code: '123456' }, ticket: undefined },
      { method: 'PUT', path: '/auth/mfa/ticket', body: { recovery_code: 'abcd-efgh' }, ticket: undefined },
    ]);
  });

  it('reads the email, the MFA status and methods, and the sessions', async () => {
    const { backend } = fake((r) => {
      if (r.path === '/auth/account/') return { _id: 'a', email: 'me@example.test' };
      if (r.path === '/auth/mfa/') return { totp_mfa: true, recovery_active: false, email_otp: false };
      if (r.path === '/auth/mfa/methods') return ['Totp', 'Recovery'];
      return [{ _id: SESSION, name: 'Concord' }];
    });
    expect(await backend.accountEmail()).toBe('me@example.test');
    expect(await backend.mfaStatus()).toEqual({ totp: true, recovery: false });
    expect(await backend.mfaMethods()).toEqual(['Totp', 'Recovery']);
    expect(await backend.sessions()).toEqual([{ id: SESSION, name: 'Concord' }]);
  });

  it('sends a ticket for a password or email change only when given one', async () => {
    const { backend, sent } = fake();
    await backend.changePassword('old', 'new');
    await backend.changePassword('old', 'new', 't1');
    await backend.changeEmail('new@example.test', 'pw', 't2');
    expect(sent()).toEqual([
      { method: 'PATCH', path: '/auth/account/change/password', body: { password: 'new', current_password: 'old' }, ticket: undefined },
      { method: 'PATCH', path: '/auth/account/change/password', body: { password: 'new', current_password: 'old' }, ticket: 't1' },
      { method: 'PATCH', path: '/auth/account/change/email', body: { email: 'new@example.test', current_password: 'pw' }, ticket: 't2' },
    ]);
  });

  it('revokes one session, or every other one, with a ticket', async () => {
    const { backend, sent } = fake();
    await backend.revokeSession(SESSION, 't1');
    await backend.revokeOtherSessions('t2');
    expect(sent()).toEqual([
      { method: 'DELETE', path: `/auth/session/${SESSION}`, body: undefined, ticket: 't1' },
      { method: 'DELETE', path: '/auth/session/all?revoke_self=false', body: undefined, ticket: 't2' },
    ]);
  });

  it('sets TOTP up and down, and fetches and regenerates recovery codes', async () => {
    const { backend, sent } = fake((r) => (r.path === '/auth/mfa/totp' && r.method === 'POST' ? { secret: 'SECRET' } : r.path === '/auth/mfa/recovery' ? ['a', 'b'] : null));
    expect(await backend.totpSecret('t1')).toBe('SECRET');
    await backend.enableTotp('123456');
    expect(await backend.recoveryCodes('t2')).toEqual(['a', 'b']);
    expect(await backend.regenerateRecoveryCodes('t3')).toEqual(['a', 'b']);
    await backend.disableTotp('t4');
    expect(sent()).toEqual([
      { method: 'POST', path: '/auth/mfa/totp', body: undefined, ticket: 't1' },
      { method: 'PUT', path: '/auth/mfa/totp', body: { totp_code: '123456' }, ticket: undefined },
      { method: 'POST', path: '/auth/mfa/recovery', body: undefined, ticket: 't2' },
      { method: 'PATCH', path: '/auth/mfa/recovery', body: undefined, ticket: 't3' },
      { method: 'DELETE', path: '/auth/mfa/totp', body: undefined, ticket: 't4' },
    ]);
  });
});
