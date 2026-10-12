/**
 * Recorded Stoat traffic through the event mapper into the domain store. Checks that every recorded
 * event lands where the UI reads it, and that replaying everything twice changes nothing.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store, type DomainEvent, type Message } from '@concord/domain';
import { describe, expect, it } from 'vitest';
import { mapFrames } from './events.ts';
import { loadScenario, type WsLine } from './fixtures/replay.ts';
import { mapMember } from './map/member.ts';
import { mapMessage } from './map/message.ts';
import { mapUser } from './map/user.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', '0.15.5');
type Frame = { type: string } & Record<string, unknown>;

/** Frames received by the scenario's observer socket, grouped by the step that caused them. */
function framesBySteps(name: string): { ready: Frame; steps: Map<string, Frame[]> } {
  const { ws } = loadScenario(FIXTURES, name);
  let step = 'start';
  let ready: Frame | undefined;
  const steps = new Map<string, Frame[]>();
  for (const line of ws as WsLine[]) {
    if ('step' in line) step = line.step;
    if (!('frame' in line)) continue;
    if (line.frame.type === 'Ready') ready ??= line.frame as Frame;
    else steps.set(step, [...(steps.get(step) ?? []), line.frame as Frame]);
  }
  return { ready: ready!, steps };
}

const events = (frames: Frame[]): DomainEvent[] => frames.flatMap(mapFrames);

function readyStore(ready: Frame): Store {
  const store = new Store();
  const [e] = events([ready]);
  if (e?.type !== 'ready') throw new Error('no Ready');
  store.self = e.users.find((u) => u.relationship === 'User')!;
  store.apply(e);
  return store;
}

describe('Ready', () => {
  const { ready } = framesBySteps('events');
  const store = readyStore(ready);
  const server = [...store.servers.values()][0]!;

  it('fills servers, channels, emoji and unreads', () => {
    expect(store.servers.size).toBe(1);
    expect(store.emojis.size).toBe(30);
    expect(store.unreads.size).toBeGreaterThan(0);
    expect(store.channelTree(server.id).map((c) => c.title)).toEqual(['Tervetuloa', 'Yleinen', 'Pelit', 'Tekniikka']);
    expect(store.channelTree(server.id).flatMap((c) => c.channels).filter((c) => c.kind === 'text' && c.voice)).toHaveLength(2);
  });

  it('lists DMs and the group, newest activity first', () => {
    const dms = store.dmList();
    expect(dms.filter((c) => c.kind === 'group')).toHaveLength(1);
    expect(dms.length).toBeGreaterThanOrEqual(6);
  });

  it('marks the seeded unread channels and the mention in pelit', () => {
    const byName = (n: string) => [...store.channels.values()].find((c) => c.kind === 'text' && c.name === n)!.id;
    expect(store.isUnread(byName('pelit'))).toBe(true);
    expect(store.mentionCount(byName('pelit'))).toBe(1);
    expect(store.isUnread(byName('kuvat-ja-videot'))).toBe(false);
  });

  it('groups members by hoisted role once the member list is loaded', () => {
    const { rest } = loadScenario(FIXTURES, 'people');
    const list = rest.find((r) => r.request.path.endsWith('/members'))!.response.body as { members: never[]; users: never[] };
    store.upsertUsers(list.users.map(mapUser));
    store.upsertMembers(list.members.map(mapMember));
    const groups = store.memberGroups(server.id);
    expect(groups.reduce((n, g) => n + g.members.length, 0)).toBe(list.members.length);
    expect(groups.at(-1)!.title).toBe('offline');
  });
});

describe('live events', () => {
  const { ready, steps } = framesBySteps('events');
  const yleinen = (store: Store) => [...store.channels.values()].find((c) => c.kind === 'text' && c.name === 'yleinen')!.id;

  function run(times: number): Store {
    const store = readyStore(ready);
    const { rest } = loadScenario(FIXTURES, 'history');
    const page = (rest[0]!.response.body as Parameters<typeof mapMessage>[0][]).map(mapMessage).reverse();
    store.setWindow(yleinen(store), page as Message[], { atNewest: true, atOldest: false });
    for (let i = 0; i < times; i++) for (const frames of steps.values()) for (const e of events(frames)) store.apply(e);
    return store;
  }

  it('apply each step', () => {
    const store = readyStore(ready);
    const ch = yleinen(store);
    store.setWindow(ch, [], { atNewest: true, atOldest: false });
    const step = (name: string) => { for (const e of events(steps.get(name) ?? [])) store.apply(e); };

    step('message');
    const created = [...store.messages.values()].find((m) => m.content === 'Tallennus: hei kaikki')!;
    expect(created.nonce).toBeDefined();
    expect(store.windows.get(ch)!.ids).toContain(created.id);
    expect((store.channels.get(ch) as { lastMessageId?: string }).lastMessageId).toBe(created.id);

    step('mention');
    expect(store.mentionCount(ch)).toBe(1);

    step('edit');
    expect(store.messages.get(created.id)!.content).toBe('Tallennus: hei kaikki (muokattu)');
    expect(store.messages.get(created.id)!.edited).toBeDefined();

    step('react');
    expect(Object.keys(store.messages.get(created.id)!.reactions)).toHaveLength(2);
    step('unreact');
    expect(Object.keys(store.messages.get(created.id)!.reactions)).toHaveLength(1);

    step('pin');
    expect(store.messages.get(created.id)!.pinned).toBe(true);
    step('unpin');
    expect(store.messages.get(created.id)!.pinned).toBe(false);

    step('append');
    const link = [...store.messages.values()].find((m) => m.content?.startsWith('https://en.wikipedia.org/wiki/Sauna'))!;
    expect(link.embeds[0]?.kind).toBe('website');

    step('delete');
    expect(store.messages.has(created.id)).toBe(false);
    expect(store.windows.get(ch)!.ids).not.toContain(created.id);

    step('typing');
    expect(Object.keys(store.typing.get(ch) ?? {})).toHaveLength(0);

    step('presence');
    const aino = [...store.users.values()].find((u) => u.username === 'aino')!;
    expect(aino.presence).toBe('Online');
    expect(aino.statusText).toBe('Moderoimassa');

    const channelsBefore = store.channels.size;
    step('channel');
    expect(store.channels.size).toBe(channelsBefore);

    step('server');
    expect([...store.servers.values()][0]!.description).toBe('Concordin kehityspalvelin. The Concord development server.');

    const server = [...store.servers.values()][0]!;
    const roles = Object.keys(server.roles).length;
    step('role');
    expect(Object.keys(store.servers.get(server.id)!.roles)).toHaveLength(roles);

    step('member');
    const pekka = [...store.members.values()].find((m) => store.users.get(m.user)?.username === 'pekka.o' || m.joinedAt > '2026-01-05T09:04');
    expect(pekka?.nickname).toBeUndefined();

    const emoji = store.emojis.size;
    step('emoji');
    expect(store.emojis.size).toBe(emoji);

    step('relationship');
    expect([...store.users.values()].find((u) => u.username === 'mikko')!.relationship).toBe('Outgoing');

    step('ack');
    expect(store.isUnread(ch)).toBe(false);
    expect(store.mentionCount(ch)).toBe(0);
  });

  it('end in the same state when every event is applied twice', () => {
    const once = run(1);
    const twice = run(2);
    const snapshot = (s: Store) => JSON.stringify({
      messages: [...s.messages.values()].sort((a, b) => a.id.localeCompare(b.id)),
      windows: [...s.windows.entries()],
      channels: [...s.channels.values()],
      unreads: [...s.unreads.values()],
      users: [...s.users.values()].map((u) => ({ ...u, online: undefined })),
    }, (_, v) => (typeof v === 'bigint' ? v.toString() : v));
    expect(snapshot(twice)).toBe(snapshot(once));
  });
});
