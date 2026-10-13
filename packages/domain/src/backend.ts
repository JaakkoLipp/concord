/**
 * What the domain needs from a backend. packages/stoat implements it; tests can swap in a fake.
 * Events are already mapped to domain shapes, so the store never sees a Stoat frame.
 */
import type {
  Channel, Emoji, Id, Member, Message, NodeInfo, Profile, Relationship, Role, Server, Unread, User,
} from './entities.ts';

/** Fields that an update removes, named by the domain property they clear. */
export type Cleared<T> = (keyof T)[];

export type DomainEvent =
  | { type: 'ready'; users: User[]; servers: Server[]; channels: Channel[]; members: Member[]; emojis: Emoji[]; unreads?: Unread[] }
  | { type: 'messageCreate'; message: Message; user?: User; member?: Member }
  | { type: 'messageUpdate'; id: Id; channel: Id; data: Partial<Message>; clear: Cleared<Message> }
  | { type: 'messageAppend'; id: Id; channel: Id; embeds: Message['embeds'] }
  | { type: 'messageDelete'; id: Id; channel: Id }
  | { type: 'messageBulkDelete'; channel: Id; ids: Id[] }
  | { type: 'reactionAdd'; id: Id; channel: Id; user: Id; emoji: string }
  | { type: 'reactionRemove'; id: Id; channel: Id; user: Id; emoji: string }
  | { type: 'reactionClear'; id: Id; channel: Id; emoji: string }
  | { type: 'channelCreate'; channel: Channel }
  | { type: 'channelUpdate'; id: Id; data: Partial<Channel>; clear: string[] }
  | { type: 'channelDelete'; id: Id }
  | { type: 'groupJoin'; id: Id; user: Id }
  | { type: 'groupLeave'; id: Id; user: Id }
  | { type: 'typingStart'; channel: Id; user: Id }
  | { type: 'typingStop'; channel: Id; user: Id }
  | { type: 'ack'; channel: Id; user: Id; message: Id }
  | { type: 'serverCreate'; server: Server; channels: Channel[]; emojis: Emoji[] }
  | { type: 'serverUpdate'; id: Id; data: Partial<Server>; clear: Cleared<Server> }
  | { type: 'serverDelete'; id: Id }
  | { type: 'roleUpdate'; server: Id; id: Id; data: Partial<Role>; clear: Cleared<Role> }
  | { type: 'roleDelete'; server: Id; id: Id }
  | { type: 'rolesReorder'; server: Id; order: Id[] }
  | { type: 'memberJoin'; server: Id; user: Id; member: Member }
  | { type: 'memberLeave'; server: Id; user: Id }
  | { type: 'memberUpdate'; server: Id; user: Id; data: Partial<Member>; clear: Cleared<Member> }
  | { type: 'userUpdate'; id: Id; data: Partial<User>; clear: Cleared<User> }
  | { type: 'relationship'; user: User; status: Relationship }
  /** A user's bio or banner changed. Stoat doesn't send the new profile, so whoever shows it fetches it again. */
  | { type: 'profileChanged'; id: Id }
  /** Synced settings written by any session of this account, this one included. */
  | { type: 'settings'; values: Record<string, { updated: number; value: string }> }
  | { type: 'emojiCreate'; emoji: Emoji }
  | { type: 'emojiDelete'; id: Id }
  | { type: 'unknown'; name: string };

export type ConnectionState = 'connecting' | 'ready' | 'reconnecting' | 'offline' | 'invalid-session';

export interface Gateway {
  /**
   * The server on screen. Where the backend supports it, the gateway keeps live member updates coming for
   * every server the user is in, and this one first.
   */
  subscribe(server: Id): void;
  /** Tell others in a channel that this account started or stopped typing. */
  typing(channel: Id, typing: boolean): void;
  close(): void;
}

export interface GatewayHandlers {
  onEvent(event: DomainEvent): void;
  onState(state: ConnectionState): void;
}

export type LoginResult =
  | { kind: 'session'; token: string; userId: Id }
  | { kind: 'mfa'; ticket: string; methods: ('Password' | 'Totp' | 'Recovery')[] }
  | { kind: 'disabled'; userId: Id };

export interface MessagePage {
  messages: Message[];
  users: User[];
  members: Member[];
}

export interface MessageQuery {
  limit?: number;
  before?: Id;
  after?: Id;
  nearby?: Id;
  sort?: 'Latest' | 'Oldest';
}

/** A message as the composer sends it. Content is in the backend's own syntax. */
export interface OutgoingMessage {
  content: string;
  replies: { id: Id; mention: boolean }[];
  attachments: Id[];
}

/** Per-channel search: text, or the pinned messages, newest first unless sorted otherwise. */
export interface SearchQuery {
  query?: string;
  pinned?: boolean;
  limit: number;
  before?: Id;
  sort: 'Latest' | 'Oldest' | 'Relevance';
}

export interface Capabilities {
  /** `Subscribe` brings live status changes from non-friend members (Stoat 0.15.5). */
  serverSubscribe: boolean;
}

export interface Backend {
  readonly capabilities: Capabilities;
  setToken(token: string | null): void;

  root(): Promise<NodeInfo>;
  login(email: string, password: string): Promise<LoginResult>;
  loginMfa(ticket: string, response: { totp: string } | { recovery: string }): Promise<LoginResult>;
  logout(): Promise<void>;
  onboarding(): Promise<boolean>;
  completeOnboarding(username: string): Promise<User>;

  self(): Promise<User>;
  messages(channel: Id, query: MessageQuery): Promise<MessagePage>;
  members(server: Id): Promise<{ members: Member[]; users: User[] }>;
  user(id: Id): Promise<User>;
  profile(id: Id): Promise<Profile>;
  mutual(id: Id): Promise<{ users: Id[]; servers: Id[]; channels: Id[] }>;
  unreads(): Promise<Unread[]>;
  settings(keys: string[]): Promise<Record<string, { updated: number; value: string }>>;

  /** Send with an idempotency key, which the backend echoes as the message's nonce. */
  sendMessage(channel: Id, message: OutgoingMessage, key: string): Promise<Message>;
  ack(channel: Id, message: Id): Promise<void>;
  editMessage(channel: Id, message: Id, content: string): Promise<Message>;
  deleteMessage(channel: Id, message: Id): Promise<void>;
  pinMessage(channel: Id, message: Id, pinned: boolean): Promise<void>;
  react(channel: Id, message: Id, emoji: string, add: boolean): Promise<void>;
  /**
   * The form the backend stores a reaction under, or null if it refuses the emoji: a custom emoji's ID, or
   * the allowlist's spelling of a Unicode emoji, so every client's 👍 lands on one chip. Loaded on first use.
   */
  reactionEmoji(): Promise<(emoji: string) => string | null>;
  setSettings(values: Record<string, string>): Promise<void>;

  /** Send a friend request by `name#1234`. Returns the user, as this account now sees them. */
  addFriend(tag: string): Promise<User>;
  /** Accept someone's friend request, or send them one if there is none. */
  acceptFriend(user: Id): Promise<User>;
  /** Deny or cancel a friend request, or remove a friend. */
  removeFriend(user: Id): Promise<User>;
  block(user: Id): Promise<User>;
  unblock(user: Id): Promise<User>;
  /** The DM with a user, created if there is none. */
  openDm(user: Id): Promise<Channel>;
  search(channel: Id, q: SearchQuery): Promise<MessagePage>;
  /**
   * Upload a file, reporting progress as a fraction. Returns the file's ID. The tag says what it is for:
   * attachments (the default), avatars, backgrounds or icons.
   */
  upload(file: Blob, name: string, onProgress?: (fraction: number) => void, tag?: string): Promise<Id>;

  connect(handlers: GatewayHandlers): Gateway;
}

