import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { Layer, configFrom } from './layer.ts';
import { MIGRATIONS } from './migrations.ts';
import { openStore } from './store.ts';
import { setLayer } from './http.ts';
import { submitFeedback, listFeedback } from './feedback.ts';
import { GET, POST } from '../../../routes/app/api/v1/feedback/+server.ts';
import { POST as CLOSE } from '../../../routes/app/api/v1/feedback/[id]/+server.ts';

const ADMIN = '01HZZZZZZZZZZZZZZZZZZADM1N';
const MEMBER = '01HZZZZZZZZZZZZZZZZZZZAAAA';
const OTHER = '01HZZZZZZZZZZZZZZZZZZZZBBB';
let layer: Layer;

beforeEach(() => {
  layer = new Layer(configFrom({ ADMIN_USER_IDS: ADMIN }, { stoatApi: 'http://api:14702' }), openStore(':memory:', MIGRATIONS), {
    fetch: async (_input, init) => {
      const token = new Headers(init?.headers).get('x-session-token');
      return token === ADMIN || token === MEMBER || token === OTHER
        ? Response.json({ _id: token }) : Response.json({ type: 'InvalidSession' }, { status: 401 });
    },
  });
  setLayer(layer);
});
afterEach(() => layer.store.close());

function event(user: string | null, method: string, payload?: unknown, id?: string, query = ''): RequestEvent {
  const url = new URL(`http://localhost/app/api/v1/feedback${id ? '/' + id : ''}${query}`);
  return {
    request: new Request(url, {
      method, headers: { ...(user ? { 'x-session-token': user } : {}), 'content-type': 'application/json' },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    }),
    url, params: id ? { id } : {}, getClientAddress: () => '127.0.0.1',
  } as unknown as RequestEvent;
}
const bug = { kind: 'bug', title: 'Can’t open settings', description: '1. Open settings\n2. Expected a panel\n3. Nothing happened' };

describe('feedback endpoints', () => {
  it('accepts a member’s bug report and an admin’s feedback with their authenticated identities', async () => {
    const sent = await POST(event(MEMBER, 'POST', { ...bug, reporter: OTHER }));
    expect(sent.status).toBe(200);
    const { id } = await sent.json();
    expect((await POST(event(ADMIN, 'POST', { kind: 'feedback', title: 'Suggestion', description: 'Please add themes.' }))).status).toBe(200);
    const response = await GET(event(ADMIN, 'GET'));
    expect(response.status).toBe(200);
    const { feedback } = await response.json();
    expect(feedback).toHaveLength(2);
    expect(feedback).toEqual(expect.arrayContaining([
      expect.objectContaining({ id, ...bug, reporter: MEMBER, status: 'open', closedBy: null, closedAt: null }),
      expect.objectContaining({ reporter: ADMIN, kind: 'feedback' }),
    ]));
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('requires a session to submit and admin rights to read or close', async () => {
    expect((await POST(event(null, 'POST', bug))).status).toBe(401);
    expect((await POST(event('invalid', 'POST', bug))).status).toBe(401);
    const { id } = await (await POST(event(MEMBER, 'POST', bug))).json();
    expect((await GET(event(MEMBER, 'GET'))).status).toBe(404);
    expect((await GET(event(OTHER, 'GET'))).status).toBe(404);
    expect((await CLOSE(event(MEMBER, 'POST', undefined, id))).status).toBe(404);
    expect((await CLOSE(event(null, 'POST', undefined, id))).status).toBe(401);
    expect(listFeedback(layer, { id: ADMIN, token: ADMIN }, false)).toHaveLength(1);
  });

  it('closes reports once, retains them in closed history, and records who closed them', async () => {
    const { id } = await (await POST(event(MEMBER, 'POST', bug))).json();
    expect((await CLOSE(event(ADMIN, 'POST', undefined, id))).status).toBe(200);
    expect(await (await GET(event(ADMIN, 'GET'))).json()).toEqual({ feedback: [] });
    const { feedback } = await (await GET(event(ADMIN, 'GET', undefined, undefined, '?closed=true'))).json();
    expect(feedback).toEqual([expect.objectContaining({ id, status: 'closed', closedBy: ADMIN, closedAt: expect.any(Number) })]);
    expect((await CLOSE(event(ADMIN, 'POST', undefined, id))).status).toBe(409);
    expect((await CLOSE(event(ADMIN, 'POST', undefined, 'missing'))).status).toBe(404);
  });

  it.each([
    { ...bug, kind: 'message' },
    { ...bug, title: '  ' },
    { ...bug, title: 'a'.repeat(121) },
    { ...bug, description: '\n \n' },
    { ...bug, description: 'a'.repeat(4001) },
    { ...bug, description: 'hidden\u202Etext' },
    { ...bug, description: 123 },
  ])('rejects invalid input %# without saving it', async (input) => {
    expect((await POST(event(MEMBER, 'POST', input))).status).toBe(400);
    expect(listFeedback(layer, { id: ADMIN, token: ADMIN }, true)).toEqual([]);
  });

  it('limits each member to ten submissions per hour without blocking another member', async () => {
    const caller = { id: MEMBER, token: MEMBER };
    for (let i = 0; i < 10; i++) submitFeedback(layer, caller, bug);
    const response = await POST(event(MEMBER, 'POST', bug));
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ type: 'FeedbackLimit' });
    expect(response.headers.get('retry-after')).toBe('3600');
    expect((await POST(event(OTHER, 'POST', bug))).status).toBe(200);
  });
});
