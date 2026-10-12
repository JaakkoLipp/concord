/**
 * Domain entities (client.md section 3). The Stoat adapter maps its wire objects into these, and nothing
 * outside packages/stoat sees Stoat's own types. Permission masks are BigInt (architecture section 4.3).
 */

export type Id = string;

export interface FileRef {
  id: Id;
  /** Autumn bucket: avatars, backgrounds, icons, banners, emojis, attachments. */
  tag: string;
  filename: string;
  contentType: string;
  size: number;
  kind: 'image' | 'video' | 'audio' | 'text' | 'file';
  width?: number;
  height?: number;
  thumbhash?: number[];
  animated?: boolean;
}

export type Presence = 'Online' | 'Idle' | 'Focus' | 'Busy' | 'Invisible';
export type Relationship = 'None' | 'User' | 'Friend' | 'Outgoing' | 'Incoming' | 'Blocked' | 'BlockedOther';

export interface User {
  id: Id;
  username: string;
  discriminator: string;
  displayName?: string;
  pronouns?: string;
  avatar?: FileRef;
  badges: number;
  flags: number;
  online: boolean;
  presence?: Presence;
  statusText?: string;
  relationship: Relationship;
  bot?: { owner: Id };
}

export interface Profile {
  content?: string;
  background?: FileRef;
}

export interface Override {
  allow: bigint;
  deny: bigint;
}

export interface Role {
  id: Id;
  name: string;
  /** A CSS colour, which may be a gradient. */
  colour?: string;
  hoist: boolean;
  /** Lower ranks are more important. */
  rank: number;
  permissions: Override;
}

export interface Category {
  id: string;
  title: string;
  channels: Id[];
}

export interface Server {
  id: Id;
  owner: Id;
  name: string;
  description?: string;
  icon?: FileRef;
  banner?: FileRef;
  channels: Id[];
  categories: Category[];
  roles: Record<Id, Role>;
  defaultPermissions: bigint;
  memberCount?: number;
}

export interface TextChannel {
  kind: 'text';
  id: Id;
  server: Id;
  name: string;
  description?: string;
  icon?: FileRef;
  lastMessageId?: Id;
  defaultPermissions?: Override;
  rolePermissions: Record<Id, Override>;
  /** Present on voice channels. Stoat 0.15 has no separate voice channel type. */
  voice?: { maxUsers?: number };
  nsfw: boolean;
}

export interface DmChannel {
  kind: 'dm';
  id: Id;
  recipients: Id[];
  active: boolean;
  lastMessageId?: Id;
}

export interface GroupChannel {
  kind: 'group';
  id: Id;
  name: string;
  owner: Id;
  description?: string;
  icon?: FileRef;
  recipients: Id[];
  lastMessageId?: Id;
  permissions?: bigint;
}

export interface SavedChannel {
  kind: 'saved';
  id: Id;
  user: Id;
}

export type Channel = TextChannel | DmChannel | GroupChannel | SavedChannel;

export interface Member {
  server: Id;
  user: Id;
  joinedAt: string;
  nickname?: string;
  avatar?: FileRef;
  roles: Id[];
  timeout?: string;
  canPublish: boolean;
  canReceive: boolean;
}

export interface Emoji {
  id: Id;
  parent: { type: 'server'; id: Id } | { type: 'detached' };
  creator: Id;
  name: string;
  animated: boolean;
}

export interface Unread {
  channel: Id;
  lastId?: Id;
  mentions: Id[];
}

export type SystemMessage =
  | { type: 'text'; content: string }
  | { type: 'user_added' | 'user_remove'; id: Id; by: Id }
  | { type: 'user_joined' | 'user_left' | 'user_kicked' | 'user_banned'; id: Id }
  | { type: 'channel_renamed'; name: string; by: Id }
  | { type: 'channel_description_changed' | 'channel_icon_changed'; by: Id }
  | { type: 'channel_ownership_changed'; from: Id; to: Id }
  | { type: 'message_pinned' | 'message_unpinned'; id: Id; by: Id }
  | { type: 'call_started'; by: Id; finishedAt?: string };

export interface EmbedMedia {
  url: string;
  width: number;
  height: number;
}

export type Embed =
  | {
      kind: 'website';
      url?: string;
      originalUrl?: string;
      title?: string;
      description?: string;
      siteName?: string;
      iconUrl?: string;
      colour?: string;
      image?: EmbedMedia & { size: 'large' | 'preview' };
      video?: EmbedMedia;
      special?: { type: 'youtube'; id: string } | { type: 'other'; name: string };
    }
  | { kind: 'image'; url: string; width: number; height: number; size: 'large' | 'preview' }
  | { kind: 'video'; url: string; width: number; height: number }
  | { kind: 'text'; url?: string; title?: string; description?: string; iconUrl?: string; colour?: string; media?: FileRef };

export interface Masquerade {
  name?: string;
  avatar?: string;
  colour?: string;
}

export interface Message {
  id: Id;
  channel: Id;
  author: Id;
  nonce?: string;
  content?: string;
  system?: SystemMessage;
  attachments: FileRef[];
  edited?: string;
  embeds: Embed[];
  mentions: Id[];
  roleMentions: Id[];
  replies: Id[];
  /** Emoji (a unicode string or a custom emoji ID) to the users who reacted. */
  reactions: Record<string, Id[]>;
  pinned: boolean;
  masquerade?: Masquerade;
  webhook?: { name: string; avatar?: string };
}

/** What `GET /api/` tells the client about the server it talks to. */
export interface NodeInfo {
  version: string;
  /** User IDs allowed to create servers. Empty means everyone. */
  serverCreators: Id[];
  uploadLimits: Record<string, number>;
  voice: { enabled: boolean; nodes: { name: string }[] };
  vapid?: string;
}
