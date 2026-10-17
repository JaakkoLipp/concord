/**
 * Autocomplete suggestions (client.md section 6.3): members and roles for `@`, channels for `#`, emoji for `:`.
 * Matches at the start of the name rank first, then at the start of a word, then anywhere.
 */
import { memberKey, type Channel, type Store } from '@concord/domain';
import { customEmojiUrl, twemojiUrl } from '$lib/markdown/emoji.ts';
import { avatarUrl } from '$lib/view/users.ts';
import { canView } from '$lib/view/channels.ts';
import type { UnicodeEmoji } from '$lib/emoji/data.ts';
import { best } from './rank.ts';
import { m } from '$lib/i18n/index.ts';
import { serialise, type QueryKind } from './text.ts';

export interface Suggestion {
  id: string;
  /** `mass`: @everyone or @online. */
  kind: 'user' | 'role' | 'mass' | 'channel' | 'emoji';
  label: string;
  detail?: string | undefined;
  image?: string | undefined;
  colour?: string | undefined;
  /** What replaces the query: a token, or a Unicode emoji. */
  insert: string;
}

const LIMIT = 8;
const MASS: ('everyone' | 'online')[] = ['everyone', 'online'];

export function suggest(
  store: Store,
  channel: Channel,
  kind: QueryKind,
  query: string,
  opts: { mentionRoles: boolean; mentionEveryone?: boolean; unicode: UnicodeEmoji[] },
): Suggestion[] {
  const server = channel.kind === 'text' ? channel.server : undefined;
  if (kind === '@') {
    const ids = server
      ? [...store.members.values()].filter((m) => m.server === server).map((m) => m.user)
      : channel.kind === 'dm' || channel.kind === 'group' ? channel.recipients : [];
    const users = best(ids, (id) => {
      const u = store.users.get(id);
      return [store.displayName(id, server), u?.username ?? '', u?.displayName ?? ''];
    }, query).slice(0, LIMIT).map((id): Suggestion => {
      const u = store.users.get(id);
      const member = server ? store.members.get(memberKey(server, id)) : undefined;
      return {
        id, kind: 'user', label: store.displayName(id, server), detail: u ? `${u.username}#${u.discriminator}` : undefined,
        image: avatarUrl(u ?? { id }, member?.avatar), colour: server ? store.roleColour(id, server) : undefined, insert: serialise.user(id),
      };
    });
    const roles = server && opts.mentionRoles
      ? best(Object.values(store.servers.get(server)?.roles ?? {}), (r) => [r.name], query).map((r): Suggestion => ({
        id: r.id, kind: 'role', label: r.name, colour: r.colour, insert: serialise.role(r.id),
      }))
      : [];
    // Only where Stoat would let them through: a server channel, with Mention everyone (m4.7-plan.md task 5).
    const mass = server && opts.mentionEveryone
      ? best(MASS, (k) => [k], query).map((k): Suggestion => ({ id: k, kind: 'mass', label: `@${k}`, detail: m.composer.mass[k], insert: `@${k}` }))
      : [];
    return [...users, ...roles, ...mass].slice(0, LIMIT);
  }
  if (kind === '#') {
    if (!server) return [];
    const channels = (store.servers.get(server)?.channels ?? [])
      .map((id) => store.channels.get(id))
      .filter((c): c is Extract<Channel, { kind: 'text' }> => c?.kind === 'text' && canView(store, c));
    return best(channels, (c) => [c.name], query).slice(0, LIMIT).map((c) => ({ id: c.id, kind: 'channel', label: c.name, insert: serialise.channel(c.id) }));
  }
  const custom = best([...store.emojis.values()], (e) => [e.name], query).map((e): Suggestion => ({
    id: e.id, kind: 'emoji', label: `:${e.name}:`, image: customEmojiUrl(e.id), insert: serialise.emoji(e.id),
  }));
  const unicode = best(opts.unicode, (e) => [e.shortcode, e.name], query).slice(0, LIMIT).map((e): Suggestion => ({
    id: e.unicode, kind: 'emoji', label: `:${e.shortcode}:`, image: twemojiUrl(e.unicode), insert: e.unicode,
  }));
  return [...custom, ...unicode].slice(0, LIMIT);
}
