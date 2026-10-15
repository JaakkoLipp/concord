/** A message's previews survive its own send response arriving late (m4.5 follow-up, found by gifs.ts). */
import { describe, expect, it } from 'vitest';
import type { Embed, Message } from './entities.ts';
import { Store } from './store/store.svelte.ts';

const message = (over: Partial<Message> = {}): Message => ({
  id: '01HZZZZZZZZZZZZZZZZZZZZM01', channel: '01HZZZZZZZZZZZZZZZZZZZZC01', author: '01HZZZZZZZZZZZZZZZZZZZZA01', content: 'https://example.com/a.gif',
  attachments: [], embeds: [], mentions: [], roleMentions: [], replies: [], reactions: {}, pinned: false, ...over,
});
const embed = { kind: 'image', url: 'https://example.com/a.gif', width: 10, height: 10, size: 'large' } as Embed;

describe('a message seen twice', () => {
  it('keeps the previews that came in between', () => {
    const s = new Store();
    s.apply({ type: 'messageCreate', message: message() });
    s.apply({ type: 'messageAppend', id: message().id, channel: message().channel, embeds: [embed] });
    s.apply({ type: 'messageCreate', message: message() });
    expect(s.messages.get(message().id)?.embeds).toEqual([embed]);
  });

  it('takes an edited version as it is', () => {
    const s = new Store();
    s.apply({ type: 'messageCreate', message: message({ embeds: [embed] }) });
    s.apply({ type: 'messageCreate', message: message({ edited: '2026-10-15T00:00:00Z', content: 'no link' }) });
    expect(s.messages.get(message().id)?.embeds).toEqual([]);
  });
});
