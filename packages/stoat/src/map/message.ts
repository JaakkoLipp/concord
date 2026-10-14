import type { Embed, Message, SystemMessage, Unread } from '@concord/domain';
import { mapFile } from './file.ts';
import { clean, type WEmbed, type WMessage, type WSystemMessage, type WUnread } from './wire.ts';

export function mapSystem(s: WSystemMessage): SystemMessage {
  if (s.type === 'call_started') return clean({ type: 'call_started', by: s.by, finishedAt: s.finished_at ?? undefined }) as SystemMessage;
  return s as SystemMessage;
}

export function mapEmbed(e: WEmbed): Embed | undefined {
  switch (e.type) {
    case 'Website':
      return clean({
        kind: 'website', url: e.url ?? undefined, originalUrl: e.original_url ?? undefined, title: e.title ?? undefined,
        description: e.description ?? undefined, siteName: e.site_name ?? undefined, iconUrl: e.icon_url ?? undefined, colour: e.colour ?? undefined,
        image: e.image ? { url: e.image.url, width: e.image.width, height: e.image.height, size: e.image.size === 'Large' ? 'large' : 'preview' } : undefined,
        video: e.video ? { url: e.video.url, width: e.video.width, height: e.video.height } : undefined,
        special: !e.special || e.special.type === 'None' ? undefined
          : e.special.type === 'YouTube' ? { type: 'youtube', id: e.special.id } : { type: 'other', name: e.special.type },
      }) as Embed;
    case 'Image':
      return { kind: 'image', url: e.url, width: e.width, height: e.height, size: e.size === 'Large' ? 'large' : 'preview' };
    case 'Video':
      return { kind: 'video', url: e.url, width: e.width, height: e.height };
    case 'Text':
      return clean({
        kind: 'text', url: e.url ?? undefined, title: e.title ?? undefined, description: e.description ?? undefined,
        iconUrl: e.icon_url ?? undefined, colour: e.colour ?? undefined, media: mapFile(e.media),
      }) as Embed;
    case 'None':
      return undefined;
  }
}

export const mapEmbeds = (list: WEmbed[] | null | undefined): Embed[] => (list ?? []).map(mapEmbed).filter((e): e is Embed => !!e);

export function mapMessage(m: WMessage): Message {
  return clean({
    id: m._id, channel: m.channel, author: m.author, nonce: m.nonce ?? undefined, content: m.content ?? undefined,
    system: m.system ? mapSystem(m.system) : undefined,
    attachments: (m.attachments ?? []).map((f) => mapFile(f)),
    edited: m.edited ?? undefined,
    embeds: mapEmbeds(m.embeds),
    mentions: m.mentions ?? [], roleMentions: m.role_mentions ?? [], replies: m.replies ?? [], flags: (m as { flags?: number }).flags || undefined,
    reactions: m.reactions ?? {},
    pinned: m.pinned ?? false,
    masquerade: m.masquerade ? clean({ name: m.masquerade.name ?? undefined, avatar: m.masquerade.avatar ?? undefined, colour: m.masquerade.colour ?? undefined }) : undefined,
    webhook: m.webhook ? clean({ name: m.webhook.name, avatar: m.webhook.avatar ?? undefined }) : undefined,
  }) as Message;
}

export function mapMessagePatch(d: Partial<WMessage>): Partial<Message> {
  const out: Partial<Message> = {};
  if (d.content !== undefined && d.content !== null) out.content = d.content;
  if (d.edited) out.edited = d.edited;
  if (d.embeds) out.embeds = mapEmbeds(d.embeds);
  if (d.pinned !== undefined && d.pinned !== null) out.pinned = d.pinned;
  if (d.reactions) out.reactions = d.reactions;
  if (d.attachments) out.attachments = d.attachments.map((f) => mapFile(f));
  return out;
}

/** Cleared fields that become absent. A cleared `Pinned` means unpinned, which mapFrame turns into `pinned: false`. */
export const MESSAGE_FIELDS: Record<string, (keyof Message)[]> = { Embeds: ['embeds'] };

export function mapUnread(u: WUnread): Unread {
  return clean({ channel: u._id.channel, lastId: u.last_id ?? undefined, mentions: u.mentions ?? [] }) as Unread;
}
