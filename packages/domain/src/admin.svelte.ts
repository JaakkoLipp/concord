/**
 * Server administration for the session (m2c-plan.md): creating a server with its bootstrap, and every admin
 * write. Writes may wait a while for Stoat's 5-per-10-s server bucket, so `pending` counts those on their
 * way and the web layer asks before the tab closes.
 */
import type { ChannelEdit, MemberEdit, RoleEdit, ServerEdit } from './backend.ts';
import type { Category, Channel, Id, Override, Role } from './entities.ts';
import { moveChannelTo } from './layout.ts';
import { Latest } from './latest.ts';
import { mergeOrder } from './ranks.ts';
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

  private readonly categoryWrites = new Map<Id, Latest<Category[]>>();

  /** Whether a categories echo for this server must be ignored, since a newer local order waits or just went. */
  holdsCategories(server: Id): boolean {
    return !!this.categoryWrites.get(server)?.holding;
  }

  /**
   * Show a new category list at once and write it, merging with any write still waiting. If Stoat refuses,
   * the server is fetched again so the sidebar matches it, and this throws.
   */
  async setCategories(server: Id, categories: Category[]): Promise<void> {
    const s = this.store.servers.get(server);
    if (s) this.store.servers.set(server, { ...s, categories });
    let w = this.categoryWrites.get(server);
    if (!w) this.categoryWrites.set(server, (w = new Latest((c) => this.run(() => this.backend.editServer(server, { categories: c })))));
    try {
      await w.set(categories);
    } catch (e) {
      const fresh = await this.backend.server(server).catch(() => null);
      const now = this.store.servers.get(server);
      if (fresh && now) this.store.servers.set(server, { ...now, categories: fresh.categories });
      throw e;
    }
  }

  private readonly rankWrites = new Map<Id, Latest<Id[]>>();

  /** Whether a role-order echo for this server must be ignored, as for categories. */
  holdsRanks(server: Id): boolean {
    return !!this.rankWrites.get(server)?.holding;
  }

  /**
   * Show a new role order at once and write it, merged at write time with roles created or deleted
   * meanwhile. On failure the server is fetched again and this throws.
   */
  async setRanks(server: Id, order: Id[]): Promise<void> {
    this.store.apply({ type: 'rolesReorder', server, order });
    let w = this.rankWrites.get(server);
    if (!w) {
      w = new Latest((o) => this.run(async () => {
        const s = this.store.servers.get(server);
        await this.backend.setRoleRanks(server, s ? mergeOrder(o, s) : o);
      }));
      this.rankWrites.set(server, w);
    }
    try {
      await w.set(order);
    } catch (e) {
      const fresh = await this.backend.server(server).catch(() => null);
      const now = this.store.servers.get(server);
      if (fresh && now) this.store.servers.set(server, { ...now, roles: fresh.roles });
      throw e;
    }
  }

  setMemberRoles(server: Id, user: Id, roles: Id[]): Promise<void> {
    return this.run(() => this.backend.setMemberRoles(server, user, roles));
  }

  /**
   * Create a channel, in a category if one is given. A private one is hidden from Everyone, then shown to the
   * chosen roles: Stoat can't do it in one step, so its name reaches every member's client first (m2c-plan.md
   * decision 8). Returns it.
   */
  async createChannel(server: Id, kind: 'text' | 'voice', name: string, category: string | null, opts: { description?: string; privateTo?: Id[] } = {}): Promise<Channel> {
    const channel = await this.run(() => this.backend.createChannel(server, kind, name, opts.description));
    if (!this.store.channels.has(channel.id)) this.store.apply({ type: 'channelCreate', channel });
    if (opts.privateTo) {
      try {
        // The roles first, then hide it from Everyone, so a failure part-way leaves no channel half private.
        for (const role of opts.privateTo) await this.setChannelPermissions(channel.id, role, { allow: Permission.ViewChannel, deny: 0n });
        await this.setChannelPermissions(channel.id, 'default', { allow: 0n, deny: Permission.ViewChannel });
      } catch (e) {
        await this.deleteChannel(channel.id).catch(() => {});
        throw e;
      }
    }
    const s = this.store.servers.get(server);
    if (s && !s.channels.includes(channel.id)) this.store.servers.set(server, { ...s, channels: [...s.channels, channel.id] });
    if (category && s) await this.setCategories(server, moveChannelTo(this.store.servers.get(server)!.categories, channel.id, category));
    return channel;
  }

  private async run<T>(fn: () => Promise<T>): Promise<T> {
    this.pending++;
    try {
      return await fn();
    } finally {
      this.pending--;
    }
  }

  /**
   * A server whose setup didn't finish, read from the server itself so any device of the owner sees it:
   * - no roles yet: stopped before the Admin role was made, or
   * - Everyone can't invite, but there is one role and it isn't an Admin with every permission: stopped
   *   while setting the Admin role's permissions.
   */
  setupUnfinished(server: Id): boolean {
    const s = this.store.servers.get(server);
    if (!s || s.owner !== this.store.selfId) return false;
    const roles = Object.values(s.roles);
    if (!roles.length) return true;
    const admin = roles.some((r) => r.name === ADMIN_ROLE && r.permissions.allow === ALL_PERMISSIONS);
    return roles.length === 1 && !admin && !has(s.defaultPermissions, Permission.InviteOthers);
  }

  /**
   * Create a server, set its icon, and run the bootstrap. Returns its ID and whether the bootstrap finished;
   * if it didn't, the server shows its owner a banner with Retry.
   */
  async createServer(name: string, icon?: File): Promise<{ id: Id; setUp: boolean }> {
    const { server, channels } = await this.run(() => this.backend.createServer(name));
    if (!this.store.servers.has(server.id)) this.store.apply({ type: 'serverCreate', server, channels, emojis: [] });
    if (icon) {
      await this.run(async () => {
        const id = await this.backend.upload(icon, icon.name, undefined, 'icons');
        await this.backend.editServer(server.id, { icon: id });
      }).catch(() => {});
    }
    const setUp = await this.bootstrap(server.id).then(() => true, () => false);
    return { id: server.id, setUp };
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
  /** Create a role, shown at once, at the bottom as Stoat places it. */
  async createRole(server: Id, name: string): Promise<Role> {
    const role = await this.run(() => this.backend.createRole(server, name));
    this.store.apply({ type: 'roleUpdate', server, id: role.id, data: role, clear: [] });
    return role;
  }
  editRole(server: Id, role: Id, change: RoleEdit) { return this.run(() => this.backend.editRole(server, role, change)); }
  setRolePermissions(server: Id, role: Id, p: Override) { return this.run(() => this.backend.setRolePermissions(server, role, p)); }
  deleteRole(server: Id, role: Id) { return this.run(() => this.backend.deleteRole(server, role)); }
  createInvite(channel: Id) { return this.run(() => this.backend.createInvite(channel)); }
  invites(server: Id) { return this.backend.invites(server); }
  deleteInvite(code: string) { return this.run(() => this.backend.deleteInvite(code)); }
  editMember(server: Id, user: Id, edit: MemberEdit, reason?: string) { return this.run(() => this.backend.editMember(server, user, edit, reason)); }
  kick(server: Id, user: Id) { return this.run(() => this.backend.kick(server, user)); }
  ban(server: Id, user: Id, reason?: string) { return this.run(() => this.backend.ban(server, user, reason)); }
  unban(server: Id, user: Id) { return this.run(() => this.backend.unban(server, user)); }
  bans(server: Id) { return this.backend.bans(server); }
  /** Upload an image and make it a server emoji, shown at once. */
  async createEmoji(server: Id, file: File, name: string) {
    const emoji = await this.run(async () => this.backend.createEmoji(await this.backend.upload(file, file.name, undefined, 'emojis'), server, name));
    this.store.apply({ type: 'emojiCreate', emoji });
    return emoji;
  }
  async renameEmoji(emoji: Id, name: string) {
    await this.run(() => this.backend.renameEmoji(emoji, name));
    this.store.apply({ type: 'emojiUpdate', id: emoji, name });
  }
  async deleteEmoji(emoji: Id) {
    await this.run(() => this.backend.deleteEmoji(emoji));
    this.store.apply({ type: 'emojiDelete', id: emoji });
  }
  editChannel(channel: Id, change: ChannelEdit) { return this.run(() => this.backend.editChannel(channel, change)); }
  deleteChannel(channel: Id) { return this.run(() => this.backend.deleteChannel(channel)); }
  setChannelPermissions(channel: Id, role: Id | 'default', p: Override) { return this.run(() => this.backend.setChannelPermissions(channel, role, p)); }
}
