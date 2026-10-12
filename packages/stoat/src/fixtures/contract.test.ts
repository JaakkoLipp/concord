/**
 * Contract tests against recorded Stoat traffic. They check structure and types, never values, so a
 * re-recording on the same version passes and a Stoat upgrade that drops or retypes a field fails.
 */
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readyQuery, type Frame } from '../transport.ts';
import { ReplayTransport, loadScenario } from './replay.ts';
import { findLeaks } from './scrub.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures');
const versions = existsSync(FIXTURES) ? readdirSync(FIXTURES).filter((d) => /^\d+\.\d+\.\d+$/.test(d)).sort() : [];

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const ulidTime = (id: string) => [...id.slice(0, 10)].reduce((t, c) => t * 32 + '0123456789ABCDEFGHJKMNPQRSTVWXYZ'.indexOf(c), 0);
const shape = (o: unknown, fields: Record<string, string>) => {
  expect(o).toBeTypeOf('object');
  for (const [key, type] of Object.entries(fields)) {
    const v = (o as Record<string, unknown>)[key];
    if (type === 'ulid') expect(v, key).toMatch(ULID);
    else if (type === 'array') expect(Array.isArray(v), key).toBe(true);
    else expect(typeof v, key).toBe(type);
  }
};

async function readyFrom(t: ReplayTransport, query = ''): Promise<Record<string, unknown>> {
  const socket = await t.connect(query);
  return new Promise((resolve) => {
    socket.onFrame((f: Frame) => { if (f.type === 'Ready') resolve(f); });
  });
}

describe.each(versions)('Stoat %s fixtures', (version) => {
  const dir = join(FIXTURES, version);
  const scenario = (name: string) => new ReplayTransport(loadScenario(dir, name));

  it('contain no emails, addresses or tokens', () => {
    expect(findLeaks(dir)).toEqual([]);
  });

  it('keep recovery codes scrubbed', async () => {
    const t = scenario('mfa');
    const codes = (await t.request({ method: 'PATCH', path: '/auth/mfa/recovery' })).body as string[];
    expect(codes.length).toBeGreaterThan(0);
    for (const code of codes) expect(code).toMatch(/^<[a-z_-]+-\d+>$/);
  });

  it('rebase message times to the fixture epoch', async () => {
    const t = scenario('history');
    const page = (await t.request({ method: 'GET', path: '/channels/01AAAAAAAAAAAAAAAAAAAAAAAA/messages' })).body as { _id: string }[];
    const epoch = Date.UTC(2026, 0, 5, 9);
    for (const m of page) {
      const at = ulidTime(m._id);
      expect(at).toBeGreaterThanOrEqual(epoch);
      expect(at - epoch).toBeLessThan(30 * 86_400_000);
    }
  });

  it('refuse non-admins server and invite creation', () => {
    const { rest } = loadScenario(dir, 'errors');
    const status = (method: string, path: RegExp) => rest.find((r) => r.request.method === method && path.test(r.request.path))?.response.status;
    expect(status('POST', /^\/servers\/create$/)).toBe(403);
    expect(status('POST', /^\/channels\/[^/]+\/invites$/)).toBe(403);
    expect(status('GET', /^\/users\/@me$/)).toBe(401);
    expect(rest.some((r) => r.response.status === 429)).toBe(true);
  });

  it('login returns a session', async () => {
    const t = scenario('login');
    const wrong = await t.request({ method: 'POST', path: '/auth/session/login' });
    expect(wrong.status).toBe(401);
    shape(wrong.body, { type: 'string' });
    const ok = await t.request({ method: 'POST', path: '/auth/session/login' });
    shape(ok.body, { result: 'string', _id: 'ulid', user_id: 'ulid', token: 'string', name: 'string' });
  });

  it('MFA login goes through a ticket', async () => {
    const t = scenario('mfa');
    const first = await t.request({ method: 'POST', path: '/auth/session/login' });
    shape(first.body, { result: 'string', ticket: 'string', allowed_methods: 'array' });
    expect((first.body as { result: string }).result).toBe('MFA');
  });

  it('Ready has the fields the client reads', async () => {
    const t = scenario('ready');
    const defaults = await readyFrom(t);
    shape(defaults, { users: 'array', servers: 'array', channels: 'array', members: 'array', emojis: 'array' });
    const client = await readyFrom(t, readyQuery());
    shape(client, { users: 'array', servers: 'array', channels: 'array', channel_unreads: 'array', voice_states: 'array' });
    const user = (client.users as unknown[])[0];
    shape(user, { _id: 'ulid', username: 'string', discriminator: 'string' });
    const server = (client.servers as unknown[])[0];
    shape(server, { _id: 'ulid', name: 'string', owner: 'ulid', channels: 'array', default_permissions: 'number' });
  });

  it('history pages are arrays of messages, or an object with users when asked', async () => {
    const t = scenario('history');
    const page = await t.request({ method: 'GET', path: '/channels/01AAAAAAAAAAAAAAAAAAAAAAAA/messages' });
    const messages = page.body as unknown[];
    expect(messages.length).toBe(50);
    shape(messages[0], { _id: 'ulid', channel: 'ulid', author: 'ulid' });
    const withUsers = await t.request({ method: 'GET', path: '/channels/01AAAAAAAAAAAAAAAAAAAAAAAA/messages?include_users=true' });
    shape(withUsers.body, { messages: 'array', users: 'array' });
  });

  it('live events include the message lifecycle', () => {
    const { ws } = loadScenario(dir, 'events');
    const types = new Set(ws.flatMap((l) => ('frame' in l ? [l.frame.type] : [])));
    for (const t of ['Message', 'MessageUpdate', 'MessageReact', 'MessageUnreact', 'MessageAppend', 'MessageDelete', 'ChannelStartTyping', 'UserUpdate', 'ChannelCreate', 'ChannelDelete', 'ServerUpdate', 'ServerRoleUpdate', 'ServerRoleDelete', 'ServerMemberJoin', 'ServerMemberLeave', 'EmojiCreate', 'EmojiDelete', 'UserRelationship', 'ChannelAck']) {
      expect(types, t).toContain(t);
    }
  });
});

it.skipIf(versions.length > 0)('has fixtures recorded', () => {
  expect.fail('no fixtures: run pnpm --filter @concord/stoat record');
});
