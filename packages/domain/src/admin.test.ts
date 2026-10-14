/** When a new server's setup counts as unfinished (m2c-plan.md task 2, review finding 3). */
import { describe, expect, it } from 'vitest';
import { ADMIN_ROLE, ALL_PERMISSIONS, ServerAdmin } from './admin.svelte.ts';
import type { Role, Server } from './entities.ts';
import { Permission } from './permissions.ts';
import type { Session } from './session.svelte.ts';
import { Store } from './store/store.svelte.ts';

const INVITE = Permission.InviteOthers;
const role = (name: string, allow: bigint): Role => ({ id: name, name, hoist: false, rank: 0, permissions: { allow, deny: 0n } });

function unfinished(defaults: bigint, roles: Role[], owner = 'me'): boolean {
  const store = new Store();
  store.self = { id: 'me', username: 'me', discriminator: '1', badges: 0, flags: 0, online: true, relationship: 'User' };
  const server: Server = { id: 's', owner, name: 'S', channels: [], categories: [], defaultPermissions: defaults, roles: Object.fromEntries(roles.map((r) => [r.id, r])) };
  store.servers.set('s', server);
  return new ServerAdmin({ store } as unknown as Session).setupUnfinished('s');
}

describe('setupUnfinished', () => {
  it('flags each step the bootstrap can stop at', () => {
    expect(unfinished(INVITE, [])).toBe(true);
    expect(unfinished(0n, [])).toBe(true);
    expect(unfinished(0n, [role(ADMIN_ROLE, 0n)])).toBe(true);
  });

  it('is done once Everyone can’t invite and Admin has everything, and never for others’ servers', () => {
    expect(unfinished(0n, [role(ADMIN_ROLE, ALL_PERMISSIONS)])).toBe(false);
    expect(unfinished(0n, [role(ADMIN_ROLE, ALL_PERMISSIONS), role('Vakio', 0n)])).toBe(false);
    // An admin who later lets Everyone invite, or builds several roles, has finished setting up.
    expect(unfinished(INVITE, [role(ADMIN_ROLE, ALL_PERMISSIONS)])).toBe(false);
    expect(unfinished(0n, [role('Mod', 0n), role('Vakio', 0n)])).toBe(false);
    expect(unfinished(INVITE, [], 'someone else')).toBe(false);
  });
});
