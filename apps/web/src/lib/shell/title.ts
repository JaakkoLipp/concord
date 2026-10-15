/**
 * The tab's title counts what the rail's badges count: mentions in servers, and unread DMs and friend requests,
 * as `(3) Concord` (m4.5-plan.md task 3). Plain unread channels don't count, as on Discord.
 */
import type { Store } from '@concord/domain';
import { m } from '$lib/i18n/index.ts';
import { canView } from '$lib/view/channels.ts';

export function unreadTotal(store: Store): number {
  const dms = store.dmList().reduce((n, c) => n + store.mentionCount(c.id), 0) + store.related('Incoming').length;
  let servers = 0;
  for (const s of store.servers.values()) servers += store.serverBadge(s.id, (c) => canView(store, c)).mentions;
  return dms + servers;
}

export const titleFor = (count: number) => (count ? `(${count}) ${m.app.name}` : m.app.name);
