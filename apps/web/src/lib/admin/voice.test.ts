/** Who may be moved, server muted or deafened, and where (m4.7-plan.md task 3, rules from m4.7-results.md). */
import { Permission as P, Store, type Channel, type Member, type TextChannel, type Role, type Server, type Session, type User, type VoiceState } from '@concord/domain';
import { describe, expect, it } from 'vitest';
import { voiceModeration } from './voice.ts';

const user = (id: string): User => ({ id, username: id, discriminator: '0001', badges: 0, flags: 0, online: true, relationship: 'None' });
const role = (id: string, rank: number, allow = 0n, deny = 0n): Role => ({ id, name: id, hoist: false, rank, permissions: { allow, deny } });
const member = (u: string, roles: string[] = [], flags: Partial<Member> = {}): Member => ({ server: 'S', user: u, joinedAt: '', roles, canPublish: true, canReceive: true, ...flags });
const textChannel = (id: string, extra: Partial<TextChannel> = {}): TextChannel => ({ kind: 'text', id, server: 'S', name: id, rolePermissions: {}, nsfw: false, ...extra });
const voiceChannel = (id: string, extra: Partial<TextChannel> = {}): TextChannel => textChannel(id, { voice: {}, ...extra });
const inCall = (u: string, channel: string): VoiceState => ({ user: u, channel, joinedAt: 1, publishing: true, receiving: true, screensharing: false, camera: false });

/** Server S owned by OWNER with a Moderator (rank 1) and an Admin (rank 0), and voice channels A, B and C. */
function world(mine: bigint, opts: { self?: string; channels?: Channel[]; defaultPermissions?: bigint } = {}): { session: Session; store: Store } {
  const store = new Store();
  const self = opts.self ?? 'MOD';
  store.self = user(self);
  store.upsertUsers(['OWNER', 'MOD', 'ADMIN', 'AINO', 'DEV'].map(user));
  const server: Server = {
    id: 'S', owner: 'OWNER', name: 'S', channels: ['A', 'B', 'C', 'T'], categories: [],
    roles: { mod: role('mod', 1, mine), admin: role('admin', 0, ~0n) }, defaultPermissions: opts.defaultPermissions ?? (P.ViewChannel | P.Connect | P.Speak),
  };
  store.servers.set('S', server);
  for (const c of opts.channels ?? [voiceChannel('A'), voiceChannel('B'), voiceChannel('C'), textChannel('T')]) store.channels.set(c.id, c);
  store.upsertMembers([member('OWNER'), member('MOD', ['mod']), member('ADMIN', ['admin']), member('AINO', []), member('DEV', [])]);
  store.apply({ type: 'voiceJoin', state: inCall('AINO', 'A') });
  return { session: { store } as unknown as Session, store };
}

describe('voiceModeration', () => {
  it('offers the voice channels where I may connect, bar the one they are in, in sidebar order', () => {
    const { session } = world(P.MoveMembers | P.MuteMembers);
    expect(voiceModeration(session, 'AINO')).toEqual({ server: 'S', channel: 'A', canMute: true, canDeafen: false, destinations: ['B', 'C'] });
  });

  it('needs the permission for each thing, and nothing at all means no menu', () => {
    expect(voiceModeration(world(P.DeafenMembers).session, 'AINO')).toMatchObject({ canMute: false, canDeafen: true, destinations: [] });
    expect(voiceModeration(world(P.MoveMembers).session, 'AINO')).toMatchObject({ canMute: false, canDeafen: false, destinations: ['B', 'C'] });
    expect(voiceModeration(world(P.KickMembers).session, 'AINO')).toBeNull();
  });

  it('checks the permission in the channel they are in, so an override there takes it away', () => {
    const a = voiceChannel('A', { rolePermissions: { mod: { allow: 0n, deny: P.MuteMembers } } });
    const { session } = world(P.MoveMembers | P.MuteMembers, { channels: [a, voiceChannel('B'), voiceChannel('C')] });
    expect(voiceModeration(session, 'AINO')).toMatchObject({ canMute: false, destinations: ['B', 'C'] });
  });

  it('leaves out a destination I cannot connect to, whatever the one moved can do', () => {
    const b = voiceChannel('B', { rolePermissions: { mod: { allow: 0n, deny: P.Connect } } });
    const c = voiceChannel('C', { defaultPermissions: { allow: 0n, deny: P.Connect }, rolePermissions: { mod: { allow: P.Connect, deny: 0n } } });
    const { session } = world(P.MoveMembers, { channels: [voiceChannel('A'), b, c] });
    // B is closed to me; C is closed to everyone but moderators, so she can't join it herself, and I may still send her.
    expect(voiceModeration(session, 'AINO')?.destinations).toEqual(['C']);
  });

  it('ignores a destination’s user limit', () => {
    const { session, store } = world(P.MoveMembers, { channels: [voiceChannel('A'), voiceChannel('B', { voice: { maxUsers: 1 } }), voiceChannel('C')] });
    store.apply({ type: 'voiceJoin', state: inCall('DEV', 'B') });
    expect(voiceModeration(session, 'AINO')?.destinations).toEqual(['B', 'C']);
  });

  it('is for people below me only: not myself, the owner, my rank or above', () => {
    const { session, store } = world(P.MoveMembers | P.MuteMembers);
    for (const u of ['MOD', 'OWNER', 'ADMIN']) {
      store.apply({ type: 'voiceJoin', state: inCall(u, 'A') });
      expect(voiceModeration(session, u)).toBeNull();
    }
    const owner = world(P.MoveMembers, { self: 'OWNER' });
    expect(voiceModeration(owner.session, 'AINO')).not.toBeNull();
  });

  it('is only for someone in a server call', () => {
    const { session, store } = world(P.MoveMembers | P.MuteMembers);
    expect(voiceModeration(session, 'DEV')).toBeNull();
    store.channels.set('DM', { kind: 'dm', id: 'DM', recipients: ['MOD', 'DEV'], active: true });
    store.apply({ type: 'voiceJoin', state: inCall('DEV', 'DM') });
    expect(voiceModeration(session, 'DEV')).toBeNull();
    store.apply({ type: 'voiceJoin', state: inCall('DEV', 'T') });
    expect(voiceModeration(session, 'DEV')).toBeNull();
  });
});
