/**
 * Concord's own layer, its shared core (architecture section 11.2): who the caller is, what they may do,
 * our own gates and per-user limits. Endpoints get one Layer; nothing here imports SvelteKit, so tests build
 * it with a fake fetch and clock.
 */
import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { GRANT_ALL_SAFE, isUlid, serverPermissions, type User } from '@concord/domain';
import { mapMember, mapServer } from '@concord/stoat';
import { StoatClient } from './stoat.ts';
import { InFlight, LayerError, RateLimiter, TtlCache, type Clock } from './util.ts';

export interface LayerConfig {
  /** Stoat's API on the internal network: http://api:14702 in the stack. */
  stoatApi: string;
  /** ADMIN_USER_IDS from host.env. Empty means nobody is admin. */
  adminIds: ReadonlySet<string>;
  /** SPOOL_DIR: where the account runner's `in` and `out` folders are mounted. Unset means the admin view's account actions are off. */
  spoolDir: string | null;
}

/** Reads the layer's settings from the environment, refusing an admin list that isn't all user IDs. */
export function configFrom(env: Record<string, string | undefined>, defaults: { stoatApi: string }): LayerConfig {
  const ids = (env.ADMIN_USER_IDS ?? '').split(/[\s,]+/).filter(Boolean);
  const bad = ids.filter((id) => !isUlid(id));
  if (bad.length) throw new Error(`ADMIN_USER_IDS holds ${bad.length} entries that aren't user IDs`);
  return { stoatApi: env.STOAT_API || defaults.stoatApi, adminIds: new Set(ids), spoolDir: env.SPOOL_DIR || null };
}

/** A caller whose session Stoat accepted. The token goes only back to Stoat, as this caller. */
export interface Caller {
  id: string;
  token: string;
}

export interface Gates {
  admin: boolean;
  serverCreator: boolean;
}

export type Use = 'read' | 'write';

/** The numbers in architecture section 11.2, gathered here. */
export const LIMITS = {
  goodSessionMs: 60_000,
  badSessionMs: 10_000,
  /** A token seen good this recently skips the per-address limit, so a flood can't lock out known users behind one NAT. */
  knownSessionMs: 60 * 60_000,
  sessions: 10_000,
  /** Lookups of unknown tokens per address, before any Stoat call. */
  addressLookups: 20,
  addressWindowMs: 60_000,
  permissionsMs: 30_000,
  serverCreatorsMs: 60_000,
  reads: 120,
  writes: 20,
  userWindowMs: 60_000,
} as const;

const MAX_TOKEN = 256;

/**
 * The key an address is limited by. An IPv6 client usually holds a whole /64, so its addresses count as one.
 * IPv4, and IPv4 mapped into IPv6, count one by one.
 */
export function addressKey(address: string): string {
  const mapped = /^::ffff:([0-9.]+)$/i.exec(address);
  if (mapped) return mapped[1]!;
  if (!address.includes(':')) return address;
  const [head = '', tail = ''] = address.toLowerCase().split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = address.includes('::') ? [...left, ...Array<string>(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right] : left;
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

export class Layer {
  readonly config: LayerConfig;
  readonly store: DatabaseSync;
  readonly stoat: StoatClient;
  private readonly now: Clock;

  private readonly sessions: TtlCache<string, string | null>;
  private readonly known: TtlCache<string, true>;
  private readonly sessionLookups = new InFlight<string, string | null>();
  private readonly addresses: RateLimiter;
  private readonly permissionCache: TtlCache<string, bigint>;
  private readonly permissionLookups = new InFlight<string, bigint>();
  private creators: { list: string[]; until: number } | null = null;
  private readonly creatorLookup = new InFlight<'creators', string[]>();
  private readonly limits: Record<Use, RateLimiter>;

  constructor(config: LayerConfig, store: DatabaseSync, opts: { fetch?: typeof fetch; now?: Clock } = {}) {
    this.config = config;
    this.store = store;
    this.stoat = new StoatClient(config.stoatApi, opts.fetch);
    this.now = opts.now ?? Date.now;
    this.sessions = new TtlCache(LIMITS.sessions, this.now);
    this.known = new TtlCache(LIMITS.sessions, this.now);
    this.addresses = new RateLimiter(LIMITS.addressLookups, LIMITS.addressWindowMs, this.now);
    this.permissionCache = new TtlCache(LIMITS.sessions, this.now);
    this.limits = {
      read: new RateLimiter(LIMITS.reads, LIMITS.userWindowMs, this.now),
      write: new RateLimiter(LIMITS.writes, LIMITS.userWindowMs, this.now),
    };
  }

  /**
   * The caller behind a session token, checked with Stoat and cached by the token's hash: 401 InvalidSession
   * when Stoat rejects it, 429 when this address has looked up too many unknown tokens, 503 when Stoat fails.
   */
  async authenticate(token: string | null, address: string): Promise<Caller> {
    if (!token || token.length > MAX_TOKEN) throw new LayerError(401, 'InvalidSession');
    const key = createHash('sha256').update(token).digest('base64url');
    const cached = this.sessions.get(key);
    if (cached === null) throw new LayerError(401, 'InvalidSession');
    if (cached) return { id: cached, token };
    if (!this.known.get(key)) {
      const wait = this.addresses.take(addressKey(address));
      if (wait) throw new LayerError(429, 'RateLimited', { retry_after: wait, limit: 'address' });
    }
    const id = await this.sessionLookups.run(key, async () => {
      const user = await this.stoat.me(token);
      this.sessions.set(key, user?._id ?? null, user ? LIMITS.goodSessionMs : LIMITS.badSessionMs);
      if (user) this.known.set(key, true, LIMITS.knownSessionMs);
      else this.known.delete(key);
      return user?._id ?? null;
    });
    if (!id) throw new LayerError(401, 'InvalidSession');
    return { id, token };
  }

  /** Counts a request against the caller's limit: 429 when they're over it. */
  limit(caller: Caller, use: Use): void {
    const wait = this.limits[use].take(caller.id);
    if (wait) throw new LayerError(429, 'RateLimited', { retry_after: wait, limit: use });
  }

  /**
   * The caller's permissions in a server, by Stoat's rules through packages/domain's calculator. At most two
   * Stoat calls, from the caller's own 5-per-10-s bucket for that server, so answers are cached for 30 s.
   * 0 when the caller can't see the server or isn't a member.
   */
  async serverPermissions(caller: Caller, server: string): Promise<bigint> {
    if (!isUlid(server)) throw new LayerError(400, 'InvalidId', { field: 'server' });
    const key = `${caller.id}:${server}`;
    const cached = this.permissionCache.get(key);
    if (cached !== undefined) return cached;
    return this.permissionLookups.run(key, async () => {
      const wire = await this.stoat.server(caller.token, server);
      let value = 0n;
      if (wire && wire.owner === caller.id) value = GRANT_ALL_SAFE;
      else if (wire) {
        const member = await this.stoat.member(caller.token, server, caller.id);
        const self = { id: caller.id } as User;
        if (member) value = serverPermissions(mapServer(wire), mapMember(member), { self });
      }
      this.permissionCache.set(key, value, LIMITS.permissionsMs);
      return value;
    });
  }

  /** 403 MissingPermission unless the caller holds `permission` in the server. */
  async requirePermission(caller: Caller, server: string, permission: bigint, name: string): Promise<void> {
    const value = await this.serverPermissions(caller, server);
    if ((value & permission) !== permission) throw new LayerError(403, 'MissingPermission', { permission: name });
  }

  /** Stoat's server-creator list, cached for a minute. */
  private async serverCreators(): Promise<string[]> {
    if (this.creators && this.creators.until > this.now()) return this.creators.list;
    return this.creatorLookup.run('creators', async () => {
      const list = await this.stoat.serverCreators();
      this.creators = { list, until: this.now() + LIMITS.serverCreatorsMs };
      return list;
    });
  }

  /** Everyone on Stoat's server-creator list: the moderators. */
  async moderators(): Promise<string[]> {
    return this.serverCreators();
  }

  /** The list just changed (the account runner changed it): read it again next time, not up to a minute later. */
  forgetModerators(): void {
    this.creators = null;
  }

  /**
   * Our own gates. Both fail closed: an empty ADMIN_USER_IDS makes nobody admin, and an empty server-creator
   * list passes nobody, though Stoat itself reads an empty list as everyone.
   */
  async gates(caller: Caller): Promise<Gates> {
    const creators = await this.serverCreators();
    return { admin: this.config.adminIds.has(caller.id), serverCreator: creators.includes(caller.id) };
  }

  /** 404 for anyone not on the admin list, so the admin endpoints don't show they exist. */
  requireAdmin(caller: Caller): void {
    if (!this.config.adminIds.has(caller.id)) throw new LayerError(404, 'NotFound');
  }

  /** 403 NotServerCreator for anyone Stoat doesn't let create servers. */
  async requireServerCreator(caller: Caller): Promise<void> {
    if (!(await this.gates(caller)).serverCreator) throw new LayerError(403, 'NotServerCreator');
  }

  /** Whether Stoat answers, for /health. Uses the cached creator list, so polling it costs Stoat little. */
  async stoatUp(): Promise<boolean> {
    try {
      await this.serverCreators();
      return true;
    } catch {
      return false;
    }
  }
}
