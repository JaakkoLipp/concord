/**
 * Stoat WebSocket frames to domain events. Frame shapes are taken from the recorded 0.15.5 fixtures;
 * the OpenAPI schema covers REST only.
 */
import type { DomainEvent, Relationship, User } from '@concord/domain';
import { CHANNEL_FIELDS, mapChannel, mapChannelPatch } from './map/channel.ts';
import { mapEmoji } from './map/emoji.ts';
import { MEMBER_FIELDS, mapMember, mapMemberPatch } from './map/member.ts';
import { MESSAGE_FIELDS, mapEmbeds, mapMessage, mapMessagePatch, mapUnread } from './map/message.ts';
import { ROLE_FIELDS, SERVER_FIELDS, mapRolePatch, mapServer, mapServerPatch } from './map/server.ts';
import { USER_FIELDS, mapUser, mapUserPatch } from './map/user.ts';
import { mapChannelVoiceStates, mapVoiceFlags, mapVoiceState, type WChannelVoiceState, type WVoiceState } from './map/voice.ts';
import type { WChannel, WEmoji, WMember, WMessage, WServer, WUnread, WUser } from './map/wire.ts';

type Frame = { type: string } & Record<string, unknown>;
const cleared = <T>(names: unknown, table: Record<string, (keyof T)[]>): (keyof T)[] =>
  (Array.isArray(names) ? names : []).flatMap((n: string) => table[n] ?? []);

export function mapFrame(f: Frame): DomainEvent[] {
  // Frames are untyped JSON; each case reads the fields the recorded fixtures show.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const x = f as any;
  switch (f.type) {
    case 'Ready':
      return [{
        type: 'ready',
        users: ((x.users ?? []) as WUser[]).map(mapUser),
        servers: ((x.servers ?? []) as WServer[]).map(mapServer),
        channels: ((x.channels ?? []) as WChannel[]).map(mapChannel),
        members: ((x.members ?? []) as WMember[]).map(mapMember),
        emojis: ((x.emojis ?? []) as WEmoji[]).map(mapEmoji),
        ...(x.channel_unreads ? { unreads: (x.channel_unreads as WUnread[]).map(mapUnread) } : {}),
        voice: mapChannelVoiceStates(x.voice_states as WChannelVoiceState[] | undefined),
      }];
    case 'Message': {
      const m = f as unknown as WMessage;
      return [{
        type: 'messageCreate', message: mapMessage(m),
        ...(m.user ? { user: mapUser(m.user) } : {}), ...(m.member ? { member: mapMember(m.member) } : {}),
      }];
    }
    case 'MessageUpdate': {
      const data = mapMessagePatch(x.data ?? {});
      if (Array.isArray(x.clear) && x.clear.includes('Pinned')) data.pinned = false;
      return [{ type: 'messageUpdate', id: x.id, channel: x.channel, data, clear: cleared(x.clear, MESSAGE_FIELDS) }];
    }
    case 'MessageAppend':
      return [{ type: 'messageAppend', id: x.id, channel: x.channel, embeds: mapEmbeds(x.append?.embeds) }];
    case 'MessageDelete':
      return [{ type: 'messageDelete', id: x.id, channel: x.channel }];
    case 'BulkMessageDelete':
      return [{ type: 'messageBulkDelete', channel: x.channel, ids: x.ids ?? [] }];
    case 'MessageReact':
      return [{ type: 'reactionAdd', id: x.id, channel: x.channel_id, user: x.user_id, emoji: x.emoji_id }];
    case 'MessageUnreact':
      return [{ type: 'reactionRemove', id: x.id, channel: x.channel_id, user: x.user_id, emoji: x.emoji_id }];
    case 'MessageRemoveReaction':
      return [{ type: 'reactionClear', id: x.id, channel: x.channel_id, emoji: x.emoji_id }];
    case 'ChannelCreate':
      return [{ type: 'channelCreate', channel: mapChannel(f as unknown as WChannel) }];
    case 'ChannelUpdate':
      return [{ type: 'channelUpdate', id: x.id, data: mapChannelPatch(x.data ?? {}), clear: (Array.isArray(x.clear) ? x.clear as string[] : []).flatMap((n) => CHANNEL_FIELDS[n] ?? []) }];
    case 'ChannelDelete':
      return [{ type: 'channelDelete', id: x.id }];
    case 'ChannelGroupJoin':
      return [{ type: 'groupJoin', id: x.id, user: x.user }];
    case 'ChannelGroupLeave':
      return [{ type: 'groupLeave', id: x.id, user: x.user }];
    case 'ChannelStartTyping':
      return [{ type: 'typingStart', channel: x.id, user: x.user }];
    case 'ChannelStopTyping':
      return [{ type: 'typingStop', channel: x.id, user: x.user }];
    case 'ChannelAck':
      return [{ type: 'ack', channel: x.id, user: x.user, message: x.message_id }];
    case 'ServerCreate':
      return [{
        type: 'serverCreate', server: mapServer(x.server as WServer),
        channels: ((x.channels ?? []) as WChannel[]).map(mapChannel), emojis: ((x.emojis ?? []) as WEmoji[]).map(mapEmoji),
        voice: mapChannelVoiceStates(x.voice_states as WChannelVoiceState[] | undefined),
      }];
    case 'ServerUpdate':
      return [{ type: 'serverUpdate', id: x.id, data: mapServerPatch(x.data ?? {}), clear: cleared(x.clear, SERVER_FIELDS) }];
    case 'ServerDelete':
      return [{ type: 'serverDelete', id: x.id }];
    case 'ServerRoleUpdate':
      return [{ type: 'roleUpdate', server: x.id, id: x.role_id, data: mapRolePatch(x.data ?? {}), clear: cleared(x.clear, ROLE_FIELDS) }];
    case 'ServerRoleDelete':
      return [{ type: 'roleDelete', server: x.id, id: x.role_id }];
    case 'ServerRoleRanksUpdate':
      return [{ type: 'rolesReorder', server: x.id, order: x.ranks ?? [] }];
    case 'ServerMemberJoin':
      return [{ type: 'memberJoin', server: x.id, user: x.user, member: mapMember(x.member as WMember) }];
    case 'ServerMemberLeave':
      return [{ type: 'memberLeave', server: x.id, user: x.user, ...(['Kick', 'Ban', 'Leave'].includes(x.reason) ? { reason: x.reason } : {}) }];
    case 'ServerMemberUpdate': {
      const id = x.id as { server: string; user: string };
      const data = mapMemberPatch(x.data ?? {});
      const clear = cleared(x.clear, MEMBER_FIELDS);
      // Clearing roles leaves none: a member always has a list, so it becomes empty rather than missing.
      if (clear.includes('roles')) data.roles = [];
      // Clearing a server mute or deafen restores the default, which is allowed.
      if (clear.includes('canPublish')) data.canPublish = true;
      if (clear.includes('canReceive')) data.canReceive = true;
      const kept = clear.filter((f) => f !== 'roles' && f !== 'canPublish' && f !== 'canReceive');
      return [{ type: 'memberUpdate', server: id.server, user: id.user, data, clear: kept }];
    }
    case 'UserUpdate': {
      const raw = (x.data ?? {}) as Partial<WUser>;
      const names: string[] = Array.isArray(x.clear) ? x.clear : [];
      const { data, clear } = mapUserPatch(raw);
      const out: DomainEvent[] = [{ type: 'userUpdate', id: x.id, data, clear: [...new Set([...cleared<User>(names, USER_FIELDS), ...clear])] }];
      // Stoat leaves the profile out of UserUpdate: setting a bio or banner sends empty data, removing one
      // sends only the clear (m2b-plan.md, checked live).
      const profileCleared = names.includes('ProfileContent') || names.includes('ProfileBackground');
      if (profileCleared || (!Object.keys(raw).length && !names.length)) out.push({ type: 'profileChanged', id: x.id });
      return out;
    }
    case 'UserRelationship': {
      const user = mapUser(x.user as WUser);
      return [{ type: 'relationship', user, status: user.relationship as Relationship }];
    }
    case 'UserSettingsUpdate': {
      const update = (x.update ?? {}) as Record<string, [number, string]>;
      return [{ type: 'settings', values: Object.fromEntries(Object.entries(update).map(([k, [updated, value]]) => [k, { updated, value }])) }];
    }
    case 'EmojiCreate':
      return [{ type: 'emojiCreate', emoji: mapEmoji(f as unknown as WEmoji) }];
    case 'EmojiUpdate':
      return typeof x.data?.name === 'string' ? [{ type: 'emojiUpdate', id: x.id, name: x.data.name }] : [];
    case 'EmojiDelete':
      return [{ type: 'emojiDelete', id: x.id }];
    case 'VoiceChannelJoin':
      return [{ type: 'voiceJoin', state: mapVoiceState(x.id, x.state as WVoiceState) }];
    case 'VoiceChannelLeave':
      return [{ type: 'voiceLeave', channel: x.id, user: x.user }];
    case 'VoiceChannelMove':
      return [{ type: 'voiceMove', from: x.from, state: mapVoiceState(x.to, x.state as WVoiceState) }];
    case 'UserVoiceStateUpdate':
      return [{ type: 'voiceUpdate', channel: x.channel_id, user: x.id, data: mapVoiceFlags(x.data ?? {}) }];
    case 'Authenticated':
    case 'Pong':
    case 'Logout':
    case 'Bulk':
      return [];
    default:
      return [{ type: 'unknown', name: f.type }];
  }
}

/** `Bulk` frames wrap several events. */
export function mapFrames(f: Frame): DomainEvent[] {
  if (f.type === 'Bulk') return ((f.v ?? []) as Frame[]).flatMap(mapFrames);
  return mapFrame(f);
}
