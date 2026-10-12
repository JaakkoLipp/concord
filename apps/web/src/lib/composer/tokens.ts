/** How composer tokens look, from the store: shared by the composer and the inline edit box. */
import type { Store } from '@concord/domain';
import { m } from '$lib/i18n/index.ts';
import { customEmojiUrl } from '$lib/markdown/emoji.ts';
import type { Labeller } from './editor.ts';

export function labeller(store: Store, server: () => string | undefined): Labeller {
  return (kind, id) => {
    const s = server();
    if (kind === 'user') return { text: `@${store.displayName(id, s) || m.markdown.unknownUser}`, self: id === store.selfId };
    if (kind === 'role') {
      const role = s ? store.servers.get(s)?.roles[id] : undefined;
      return { text: `@${role?.name ?? m.markdown.unknownRole}`, colour: role?.colour };
    }
    if (kind === 'channel') {
      const c = store.channels.get(id);
      return { text: `#${c && (c.kind === 'text' || c.kind === 'group') ? c.name : m.markdown.unknownChannel}` };
    }
    return { image: customEmojiUrl(id), alt: `:${store.emojis.get(id)?.name ?? id}:` };
  };
}
