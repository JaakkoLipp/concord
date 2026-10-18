/** Reports (reports.ts, m4.7-plan.md task 9): who they reach, who may read and close them, and what is kept. */
import { describe, expect, it } from 'vitest';
import { Permission } from '@concord/domain';
import { Layer, configFrom, type Caller } from './layer.ts';
import { MIGRATIONS } from './migrations.ts';
import { openStore } from './store.ts';
import { EVIDENCE_KEPT_MS, closeReport, countReports, dropOldEvidence, fileReport, listReports } from './reports.ts';
import { LayerError } from './util.ts';

const ADMIN = '01HZZZZZZZZZZZZZZZZZZADM1N';
const MOD = '01HZZZZZZZZZZZZZZZZZZZZM0D';
const DEV = '01HZZZZZZZZZZZZZZZZZZZZDEV';
const AINO = '01HZZZZZZZZZZZZZZZZZZZA1N0';
const SERVER = '01HZZZZZZZZZZZZZZZZZSERWER';
const TEXT = '01HZZZZZZZZZZZZZZZZZZZTEXT';
const DM = '01HZZZZZZZZZZZZZZZZZZZZZDM';
const MSG = '01HZZZZZZZZZZZZZZZZZZZZMSG';
const DM_MSG = '01HZZZZZZZZZZZZZZZZZZZDMSG';
const MOD_ROLE = '01HZZZZZZZZZZZZZZZZZZZR0L3';

/** A fake Stoat: ADMIN owns the server, MOD has Manage messages, DEV and AINO are members. AINO wrote both messages. */
function fakeFetch(input: string | URL | Request): Promise<Response> {
  const url = new URL(String(input));
  const p = url.pathname;
  if (p === '/') return Promise.resolve(Response.json({ features: { limits: { global: { restrict_server_creation: [] } } } }));
  if (p === `/servers/${SERVER}`) {
    return Promise.resolve(Response.json({
      _id: SERVER, owner: ADMIN, name: 'S', channels: [TEXT], default_permissions: Number(Permission.ViewChannel),
      roles: { [MOD_ROLE]: { name: 'Mod', permissions: { a: Number(Permission.ManageMessages), d: 0 }, rank: 1 } },
    }));
  }
  const member = /^\/servers\/\w+\/members\/(\w+)$/.exec(p);
  if (member) return Promise.resolve(Response.json({ _id: { server: SERVER, user: member[1] }, joined_at: '2026-01-01T00:00:00Z', roles: member[1] === MOD ? [MOD_ROLE] : [] }));
  if (p === `/channels/${TEXT}`) return Promise.resolve(Response.json({ channel_type: 'TextChannel', _id: TEXT, server: SERVER, name: 'general' }));
  if (p === `/channels/${DM}`) return Promise.resolve(Response.json({ channel_type: 'DirectMessage', _id: DM, recipients: [DEV, AINO] }));
  if (p === `/channels/${TEXT}/messages/${MSG}`) return Promise.resolve(Response.json({ _id: MSG, author: AINO, content: 'rude words' }));
  if (p === `/channels/${DM}/messages/${DM_MSG}`) return Promise.resolve(Response.json({ _id: DM_MSG, author: AINO, content: 'dm words' }));
  return Promise.resolve(Response.json({ type: 'NotFound' }, { status: 404 }));
}

const setup = () => new Layer(configFrom({ ADMIN_USER_IDS: ADMIN }, { stoatApi: 'http://api:14702' }), openStore(':memory:', MIGRATIONS), { fetch: fakeFetch as typeof fetch, now: Date.now });
const caller = (id: string): Caller => ({ id, token: `${id}-token` });
async function refusal(p: Promise<unknown>): Promise<LayerError> {
  try { await p; } catch (e) { if (e instanceof LayerError) return e; throw e; }
  throw new Error('expected a refusal');
}
const serverMessage = { kind: 'message', channel: TEXT, message: MSG, reason: 'harassment', notes: 'again' };

describe('filing a report', () => {
  it('sends a server message to that server’s moderators, with its text as evidence', async () => {
    const layer = setup();
    await fileReport(layer, caller(DEV), serverMessage);
    const [r] = await listReports(layer, caller(MOD), { server: SERVER }, false);
    expect(r).toMatchObject({ kind: 'message', server: SERVER, reported: AINO, reporter: DEV, content: 'rude words', reason: 'harassment', status: 'open' });
    expect(await listReports(layer, caller(ADMIN), 'admin', false)).toEqual([]);
  });

  it('sends a DM message and a user to the app’s admins only', async () => {
    const layer = setup();
    await fileReport(layer, caller(DEV), { kind: 'message', channel: DM, message: DM_MSG, reason: 'spam' });
    await fileReport(layer, caller(DEV), { kind: 'user', user: AINO, reason: 'other', notes: '' });
    const admins = (await listReports(layer, caller(ADMIN), 'admin', false)).map((r) => [r.kind, r.content]);
    expect(admins).toHaveLength(2);
    expect(admins).toEqual(expect.arrayContaining([['user', null], ['message', 'dm words']]));
    expect(await listReports(layer, caller(MOD), { server: SERVER }, false)).toEqual([]);
    expect((await refusal(listReports(layer, caller(MOD), 'admin', false))).status).toBe(404);
  });

  it('refuses what the reporter can’t read, their own, a bad reason, and an 11th in an hour', async () => {
    const layer = setup();
    expect((await refusal(fileReport(layer, caller(DEV), { ...serverMessage, message: '01HZZZZZZZZZZZZZZZZZZZZZZZ' }))).status).toBe(404);
    expect((await refusal(fileReport(layer, caller(AINO), serverMessage))).type).toBe('OwnMessage');
    expect((await refusal(fileReport(layer, caller(DEV), { ...serverMessage, reason: 'boring' }))).type).toBe('InvalidReason');
    for (let i = 0; i < 10; i++) await fileReport(layer, caller(DEV), serverMessage);
    expect((await refusal(fileReport(layer, caller(DEV), serverMessage))).type).toBe('ReportLimit');
  });
});

describe('reading and closing', () => {
  it('needs Manage messages in the server', async () => {
    const layer = setup();
    await fileReport(layer, caller(DEV), serverMessage);
    expect((await refusal(listReports(layer, caller(AINO), { server: SERVER }, false))).status).toBe(403);
    expect((await refusal(countReports(layer, caller(DEV), { server: SERVER }))).status).toBe(403);
    expect(await countReports(layer, caller(MOD), { server: SERVER })).toBe(1);
  });

  it('never shows the reported person reports about them, nor lets them close one', async () => {
    const layer = setup();
    await fileReport(layer, caller(DEV), { kind: 'message', channel: TEXT, message: MSG, reason: 'spam' });
    // Make the moderator the one reported.
    const id = (await listReports(layer, caller(MOD), { server: SERVER }, false))[0]!.id;
    layer.store.prepare('UPDATE reports SET reported = ? WHERE id = ?').run(MOD, id);
    expect(await listReports(layer, caller(MOD), { server: SERVER }, true)).toEqual([]);
    expect((await refusal(closeReport(layer, caller(MOD), id, ''))).status).toBe(404);
  });

  it('closes once, with a note, by someone who may read it', async () => {
    const layer = setup();
    await fileReport(layer, caller(DEV), serverMessage);
    const id = (await listReports(layer, caller(MOD), { server: SERVER }, false))[0]!.id;
    expect((await refusal(closeReport(layer, caller(DEV), id, ''))).status).toBe(404);
    await closeReport(layer, caller(MOD), id, 'warned them');
    expect((await refusal(closeReport(layer, caller(MOD), id, ''))).type).toBe('ReportClosed');
    expect(await listReports(layer, caller(MOD), { server: SERVER }, false)).toEqual([]);
    expect((await listReports(layer, caller(MOD), { server: SERVER }, true))[0]).toMatchObject({ status: 'closed', closedBy: MOD, closeNote: 'warned them' });
  });

  it('drops the evidence 90 days after closing, and keeps it before', async () => {
    const layer = setup();
    await fileReport(layer, caller(DEV), serverMessage);
    const id = (await listReports(layer, caller(MOD), { server: SERVER }, false))[0]!.id;
    await closeReport(layer, caller(MOD), id, '');
    const closedAt = (layer.store.prepare('SELECT closed_at AS t FROM reports WHERE id = ?').get(id) as { t: number }).t;
    dropOldEvidence(layer, closedAt + EVIDENCE_KEPT_MS - 1);
    expect((await listReports(layer, caller(MOD), { server: SERVER }, true))[0]!.content).toBe('rude words');
    layer.store.prepare('UPDATE reports SET closed_at = ? WHERE id = ?').run(Date.now() - EVIDENCE_KEPT_MS - 1, id);
    expect((await listReports(layer, caller(MOD), { server: SERVER }, true))[0]!.content).toBeNull();
  });
});
