/** Notification text (m2c-plan.md task 8): names, not IDs, and no spoilers on the lock screen. */
import { Store, type Message } from '@concord/domain';
import { describe, expect, it } from 'vitest';
import { notificationBody, notificationTitle } from './text.ts';

const U = '01M4VETTGW29V516EF3D53H1V3';
const S = '01M4WPBMZWYQ9GB009CG8FDEZA';
const C = '01M4WPBMZW1D977DMJNR76RZQE';
const R = '01M4WPEYFHFF8WST5W6TWQ0FX1';
const E = '01M4WPFY6YNTTTJHPHNZ94KRRX';

function store(): Store {
  const s = new Store();
  s.servers.set(S, { id: S, owner: U, name: 'Kerho', channels: [C], categories: [], defaultPermissions: 0n, roles: { [R]: { id: R, name: 'Pelaajat', hoist: false, rank: 0, permissions: { allow: 0n, deny: 0n } } } });
  s.channels.set(C, { kind: 'text', id: C, server: S, name: 'yleinen', rolePermissions: {}, nsfw: false });
  s.users.set(U, { id: U, username: 'tuuli', discriminator: '1', badges: 0, flags: 0, online: true, relationship: 'None' });
  s.emojis.set(E, { id: E, parent: { type: 'server', id: S }, creator: U, name: 'kahvi', animated: false });
  return s;
}
const msg = (content: string, over: Partial<Message> = {}): Message => ({ id: 'm', channel: C, author: U, content, attachments: [], embeds: [], mentions: [], roleMentions: [], replies: [], reactions: {}, pinned: false, ...over });

describe('notification text', () => {
  it('names the author, channel and server', () => {
    expect(notificationTitle(store(), msg('moi'))).toBe('tuuli (#yleinen, Kerho)');
  });

  it('writes mentions, channels and emoji by name and hides spoilers', () => {
    expect(notificationBody(store(), msg(`<@${U}> <%${R}> <#${C}> :${E}: ||salaisuus|| ok`))).toBe('@tuuli @Pelaajat #yleinen :kahvi: spoiler ok');
  });

  it('says how many files came alone, and cuts long text', () => {
    const file = { id: 'f', tag: 'attachments', filename: 'a.png', contentType: 'image/png', size: 1, kind: 'image' as const };
    expect(notificationBody(store(), msg('', { attachments: [file, file] }))).toBe('Sent 2 files');
    expect([...notificationBody(store(), msg('ä'.repeat(500)))].length).toBe(200);
  });
});
