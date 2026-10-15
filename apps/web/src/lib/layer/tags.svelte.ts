/**
 * Server tags on this client (m4.5-plan.md task 10): who wears which, and which servers have one. Fetched on
 * sign-in, every 60 s and when the window regains focus, as the layer has no live stream yet (architecture
 * section 11.2), so a change shows within a minute. A worn tag shows only for someone this client knows to be a
 * member of the tag's server, so a departed member's tag disappears at once.
 */
import { SvelteMap } from 'svelte/reactivity';
import { memberKey, type Id, type Layer, type ServerTag, type Store } from '@concord/domain';

const EVERY_MS = 60_000;
/** The most users one lookup asks about: far more than this community's member lists hold. */
const MAX_USERS = 1_000;

export class Tags {
  readonly worn = new SvelteMap<Id, ServerTag>();
  readonly servers = new SvelteMap<Id, ServerTag>();
  private stop: (() => void) | null = null;
  private store: Store | null = null;
  private layer: Layer | null = null;

  start(store: Store, layer: Layer): void {
    this.end();
    this.store = store;
    this.layer = layer;
    const timer = setInterval(() => void this.refresh(), EVERY_MS);
    const focus = () => void this.refresh();
    window.addEventListener('focus', focus);
    this.stop = () => { clearInterval(timer); window.removeEventListener('focus', focus); };
    void this.refresh();
  }

  end(): void {
    this.stop?.();
    this.stop = null;
    this.store = null;
    this.layer = null;
    this.worn.clear();
    this.servers.clear();
  }

  /** Fetches both again. A failure keeps what was there, so a layer blip doesn't make tags flicker. */
  async refresh(): Promise<void> {
    const { store, layer } = this;
    if (!store || !layer) return;
    const users = [...new Set([...store.users.keys()])].slice(0, MAX_USERS);
    const servers = [...store.servers.keys()];
    try {
      const [worn, tags] = await Promise.all([layer.wornTags(users), layer.serverTags(servers)]);
      if (this.layer !== layer) return;
      replace(this.worn, worn);
      replace(this.servers, tags);
    } catch {
      // Kept as it was.
    }
  }

  /** The tag to show for a user: theirs, while this client knows them to be in its server. */
  of(store: Store, user: Id): ServerTag | undefined {
    const t = this.worn.get(user);
    return t && store.members.has(memberKey(t.server, user)) ? t : undefined;
  }
}

function replace(map: SvelteMap<Id, ServerTag>, next: Record<Id, ServerTag>): void {
  for (const id of map.keys()) if (!next[id]) map.delete(id);
  for (const [id, t] of Object.entries(next)) {
    const old = map.get(id);
    if (!old || old.tag !== t.tag || old.emoji !== t.emoji || old.server !== t.server) map.set(id, t);
  }
}

export const tags = new Tags();
