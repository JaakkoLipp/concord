/** The notification rule and the settings round trip (m2c-plan.md task 8). */
import { describe, expect, it } from 'vitest';
import type { Message } from './entities.ts';
import { Flags, muteActive, nextMuteEnd, parseNotifications, shouldNotify, writeNotifications, type NotifyContext } from './notify.ts';

const msg = (over: Partial<Message> = {}): Message => ({
  id: 'm', channel: 'c', author: 'tuuli', content: 'moi', attachments: [], embeds: [], mentions: [], roleMentions: [], replies: [], reactions: {}, pinned: false, ...over,
});
const ctx = (over: Partial<NotifyContext> = {}): NotifyContext => ({
  self: 'dev', roles: ['pelaajat'], presence: 'Online', level: 'all', muted: false, blocked: false, focusedChannel: null, ...over,
});

describe('shouldNotify', () => {
  it('follows the level', () => {
    expect(shouldNotify(msg(), ctx())).toBe(true);
    expect(shouldNotify(msg(), ctx({ level: 'mention' }))).toBe(false);
    expect(shouldNotify(msg({ mentions: ['dev'] }), ctx({ level: 'mention' }))).toBe(true);
    expect(shouldNotify(msg({ mentions: ['dev'] }), ctx({ level: 'none' }))).toBe(false);
  });

  it('counts roles, @everyone and @online as mentions, and never "don’t notify"', () => {
    expect(shouldNotify(msg({ roleMentions: ['pelaajat'] }), ctx({ level: 'mention' }))).toBe(true);
    expect(shouldNotify(msg({ roleMentions: ['vakio'] }), ctx({ level: 'mention' }))).toBe(false);
    expect(shouldNotify(msg({ flags: Flags.MentionsEveryone }), ctx({ level: 'mention' }))).toBe(true);
    expect(shouldNotify(msg({ flags: Flags.MentionsOnline }), ctx({ level: 'mention' }))).toBe(true);
    // Stoat's own client mistakes flag 2 for a mention; it means the opposite.
    expect(shouldNotify(msg({ flags: Flags.SuppressNotifications, mentions: ['dev'] }), ctx())).toBe(false);
  });

  it('is silent for your own messages, blocked people, system lines and the focused channel', () => {
    expect(shouldNotify(msg({ author: 'dev' }), ctx())).toBe(false);
    expect(shouldNotify(msg(), ctx({ blocked: true }))).toBe(false);
    expect(shouldNotify(msg({ system: { type: 'user_joined', id: 'x' } }), ctx())).toBe(false);
    expect(shouldNotify(msg(), ctx({ focusedChannel: 'c' }))).toBe(false);
    expect(shouldNotify(msg(), ctx({ focusedChannel: 'other' }))).toBe(true);
  });

  it('follows Busy and Focus', () => {
    expect(shouldNotify(msg({ mentions: ['dev'] }), ctx({ presence: 'Busy' }))).toBe(false);
    expect(shouldNotify(msg(), ctx({ presence: 'Focus' }))).toBe(false);
    expect(shouldNotify(msg({ flags: Flags.MentionsEveryone }), ctx({ presence: 'Focus' }))).toBe(true);
  });

  it('lets only a personal mention through a mute', () => {
    expect(shouldNotify(msg(), ctx({ muted: true }))).toBe(false);
    expect(shouldNotify(msg({ flags: Flags.MentionsEveryone, roleMentions: ['pelaajat'] }), ctx({ muted: true }))).toBe(false);
    expect(shouldNotify(msg({ mentions: ['dev'] }), ctx({ muted: true }))).toBe(true);
    expect(shouldNotify(msg({ mentions: ['dev'] }), ctx({ muted: true, level: 'none' }))).toBe(false);
  });
});

describe('notifications settings', () => {
  it('reads Stoat’s shape, and an old "muted" level as a mute with no end', () => {
    const s = parseNotifications(JSON.stringify({
      server: { s1: 'mention', s2: 'muted' }, channel: { c1: 'none', c2: 'bogus' },
      server_mutes: { s3: { until: 5000 } }, channel_mutes: { c3: {} },
    }));
    expect(s).toEqual({ server: { s1: 'mention' }, channel: { c1: 'none' }, serverMutes: { s2: {}, s3: { until: 5000 } }, channelMutes: { c3: {} } });
    expect(parseNotifications('not json')).toEqual({ server: {}, channel: {}, serverMutes: {}, channelMutes: {} });
  });

  it('writes every sub-key and keeps keys it doesn’t know', () => {
    const raw = JSON.stringify({ server: { s2: 'muted' }, extra: { keep: true } });
    const next = parseNotifications(raw);
    next.channel.c1 = 'all';
    const written = JSON.parse(writeNotifications(raw, next)) as Record<string, unknown>;
    expect(written).toEqual({ extra: { keep: true }, server: {}, channel: { c1: 'all' }, server_mutes: { s2: {} }, channel_mutes: {} });
    // A level some other client invented survives our write.
    const odd = JSON.parse(writeNotifications(JSON.stringify({ channel: { c9: 'custom' } }), parseNotifications('{}'))) as { channel: Record<string, string> };
    expect(odd.channel).toEqual({ c9: 'custom' });
  });

  it('ends timed mutes on time', () => {
    expect(muteActive({}, 10)).toBe(true);
    expect(muteActive({ until: 20 }, 10)).toBe(true);
    expect(muteActive({ until: 20 }, 20)).toBe(false);
    expect(muteActive(undefined, 10)).toBe(false);
    expect(nextMuteEnd({ server: {}, channel: {}, serverMutes: { a: { until: 50 } }, channelMutes: { b: { until: 30 }, c: {} } }, 10)).toBe(30);
  });
});
