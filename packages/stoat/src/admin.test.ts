/** Admin events as the M2c probes recorded them on Stoat 0.15.5 (m2c-plan.md). */
import { Store } from '@concord/domain';
import { describe, expect, it } from 'vitest';
import { mapFrames } from './events.ts';

const S = '01M4WPBMZWYQ9GB009CG8FDEZA';
const G = '01M4WPBMZW1D977DMJNR76RZQE';
const E = '01M4WPFY6YNTTTJHPHNZ94KRRX';

describe('admin events', () => {
  it('keeps why a member left', () => {
    expect(mapFrames({ type: 'ServerMemberLeave', id: S, user: 'u', reason: 'Ban' })).toEqual([{ type: 'memberLeave', server: S, user: 'u', reason: 'Ban' }]);
    expect(mapFrames({ type: 'ServerMemberLeave', id: S, user: 'u' })).toEqual([{ type: 'memberLeave', server: S, user: 'u' }]);
  });

  it('leaves a member with no roles, not a missing list, when their roles are cleared', () => {
    expect(mapFrames({ type: 'ServerMemberUpdate', id: { server: S, user: 'u' }, data: {}, clear: ['Roles'] }))
      .toEqual([{ type: 'memberUpdate', server: S, user: 'u', data: { roles: [] }, clear: [] }]);
  });

  it('applies system-message channels, their removal, and emoji renames', () => {
    const store = new Store();
    for (const e of mapFrames({ type: 'ServerCreate', id: S, server: { _id: S, owner: 'o', name: 'S', channels: [G], default_permissions: 0 }, channels: [], emojis: [{ _id: E, parent: { type: 'Server', id: S }, creator_id: 'o', name: 'vanha' }] })) store.apply(e);
    for (const e of mapFrames({ type: 'ServerUpdate', id: S, data: { system_messages: { user_joined: G, user_banned: G } }, clear: [] })) store.apply(e);
    expect(store.servers.get(S)?.systemMessages).toEqual({ joined: G, banned: G });
    for (const e of mapFrames({ type: 'ServerUpdate', id: S, data: {}, clear: ['SystemMessages'] })) store.apply(e);
    expect(store.servers.get(S)?.systemMessages).toBeUndefined();
    for (const e of mapFrames({ type: 'EmojiUpdate', id: E, data: { name: 'uusi' } })) store.apply(e);
    expect(store.emojis.get(E)?.name).toBe('uusi');
  });
});
