/**
 * Server administration for the session (m2c-plan.md): creating a server with its bootstrap, and every admin
 * write. Writes may wait a while for Stoat's 5-per-10-s server bucket, so `pending` counts those on their
 * way and the web layer asks before the tab closes.
 */
import type { ChannelEdit, RoleEdit, ServerEdit } from './backend.ts';
import type { Id, Override, Role } from './entities.ts';
import { Permission, has } from './permissions.ts';
import type { Session } from './session.svelte.ts';

/** Every permission Stoat defines: what the Admin role made with a server holds (m2c-plan.md decision 4). */
export const ALL_PERMISSIONS = Object.values(Permission).reduce((a, b) => a | b, 0n);
export const ADMIN_ROLE = 'Admin';

export class ServerAdmin {
  /** Admin writes sent or waiting to be sent. */
  pending = $state(0);
  private readonly session: Session;

  constructor(session: Session) {
    this.session = session;
  }

  private get backend() { return this.session.backend; }
  private get store() { return this.session.store; }

  private async run<T>(fn: () => Promise<T>): Promise<T> {
    this.pending++;
    try {
      return await fn();
    } finally {
      this.pending--;
    }
  }

  /**
   * A server whose setup didn't finish: no roles yet, and Everyone can still invite. Read from the server
   * itself, so any device of the owner sees it.
   */
  setupUnfinished(server: Id): boolean {
    const s = this.store.servers.get(server);
    return !!s && s.owner === this.store.selfId && !Object.keys(s.roles).length && has(s.defaultPermissions, Permission.InviteOthers);
  }

  /** Create a server, set its icon, and run the bootstrap. Returns its ID even if the bootstrap fails. */
  async createServer(name: string, icon?: File): Promise<Id> {
    const { server, channels } = await this.run(() => this.backend.createServer(name));
    if (!this.store.servers.has(server.id)) this.store.apply({ type: 'serverCreate', server, channels, emojis: [] });
    if (icon) {
      await this.run(async () => {
        const id = await this.backend.upload(icon, icon.name, undefined, 'icons');
        await this.backend.editServer(server.id, { icon: id });
      }).catch(() => {});
    }
    await this.bootstrap(server.id).catch(() => {});
    return server.id;
  }

  /**
   * Architecture section 4.2: Everyone loses `InviteOthers`, then an Admin role with every permission is made
   * first in rank. Steps already done are skipped, so Retry can run it again.
   */
  async bootstrap(server: Id): Promise<void> {
    await this.run(async () => {
      const s = this.store.servers.get(server);
      if (!s) return;
      if (has(s.defaultPermissions, Permission.InviteOthers)) {
        await this.backend.setDefaultPermissions(server, s.defaultPermissions & ~Permission.InviteOthers);
      }
      const admin: Role = Object.values(this.store.servers.get(server)?.roles ?? {}).find((r) => r.name === ADMIN_ROLE)
        ?? await this.backend.createRole(server, ADMIN_ROLE);
      if (admin.permissions.allow !== ALL_PERMISSIONS || admin.permissions.deny) {
        await this.backend.setRolePermissions(server, admin.id, { allow: ALL_PERMISSIONS, deny: 0n });
      }
    });
  }

  editServer(server: Id, change: ServerEdit): Promise<void> {
    return this.run(() => this.backend.editServer(server, change));
  }

  /** Upload a server icon or banner. Returns the file's ID, to set with `editServer`. */
  uploadImage(kind: 'icon' | 'banner', file: File): Promise<Id> {
    return this.run(() => this.backend.upload(file, file.name, undefined, kind === 'icon' ? 'icons' : 'banners'));
  }

  async deleteServer(server: Id): Promise<void> {
    this.session.ownRemovals.add(server);
    try {
      await this.run(() => this.backend.deleteServer(server));
    } catch (e) {
      this.session.ownRemovals.delete(server);
      throw e;
    }
  }

  async leaveServer(server: Id): Promise<void> {
    this.session.ownRemovals.add(server);
    try {
      await this.run(() => this.backend.leaveServer(server));
    } catch (e) {
      this.session.ownRemovals.delete(server);
      throw e;
    }
  }

  // The rest are thin: each task's screen adds what it needs around them.
  setDefaultPermissions(server: Id, permissions: bigint) { return this.run(() => this.backend.setDefaultPermissions(server, permissions)); }
  createRole(server: Id, name: string) { return this.run(() => this.backend.createRole(server, name)); }
  editRole(server: Id, role: Id, change: RoleEdit) { return this.run(() => this.backend.editRole(server, role, change)); }
  setRolePermissions(server: Id, role: Id, p: Override) { return this.run(() => this.backend.setRolePermissions(server, role, p)); }
  deleteRole(server: Id, role: Id) { return this.run(() => this.backend.deleteRole(server, role)); }
  editChannel(channel: Id, change: ChannelEdit) { return this.run(() => this.backend.editChannel(channel, change)); }
  deleteChannel(channel: Id) { return this.run(() => this.backend.deleteChannel(channel)); }
  setChannelPermissions(channel: Id, role: Id | 'default', p: Override) { return this.run(() => this.backend.setChannelPermissions(channel, role, p)); }
}
