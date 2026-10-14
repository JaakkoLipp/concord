/**
 * A notification's title and body (m2c-plan.md, "What it shows"): mentions, channels and custom emoji by
 * name, spoilers hidden, and a line for files alone.
 */
import type { Message, Store } from '@concord/domain';
import { m } from '../i18n/index.ts';
import { channelName } from '../view/channels.ts';

const BODY_MAX = 200;

export function notificationTitle(store: Store, message: Message): string {
  const c = store.channels.get(message.channel);
  const server = c?.kind === 'text' ? c.server : undefined;
  const author = message.masquerade?.name ?? store.displayName(message.author, server);
  if (c?.kind === 'text') return m.notify.inServer(author, c.name, store.servers.get(c.server)?.name ?? '');
  if (c?.kind === 'group') return m.notify.inGroup(author, channelName(store, c));
  return author;
}

export function notificationBody(store: Store, message: Message): string {
  const c = store.channels.get(message.channel);
  const server = c?.kind === 'text' ? c.server : undefined;
  const text = (message.content ?? '')
    .replace(/\|\|[\s\S]*?\|\|/g, m.notify.spoiler)
    .replace(/<@([0-9A-Z]{26})>/g, (_, id: string) => `@${store.displayName(id, server)}`)
    .replace(/<%([0-9A-Z]{26})>/g, (_, id: string) => `@${(server && store.servers.get(server)?.roles[id]?.name) ?? id}`)
    .replace(/<#([0-9A-Z]{26})>/g, (_, id: string) => { const x = store.channels.get(id); return `#${x ? channelName(store, x) : id}`; })
    .replace(/:([0-9A-Z]{26}):/g, (_, id: string) => `:${store.emojis.get(id)?.name ?? id}:`)
    .replace(/\s+/g, ' ')
    .trim();
  if (!text && message.attachments.length) return m.notify.sent(message.attachments.length);
  return [...text].length > BODY_MAX ? `${[...text].slice(0, BODY_MAX - 1).join('')}…` : text;
}
