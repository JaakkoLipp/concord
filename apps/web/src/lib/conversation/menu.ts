/**
 * A message's context menu (m4.5-plan.md task 2): quick reactions, then what the action bar offers and more,
 * and extra items for the link or image that was pressed. Every item shows only when it is allowed.
 */
import type { Message } from '@concord/domain';
import type { MenuItem } from '@concord/ui';
import { m } from '$lib/i18n/index.ts';
import type { MessageActions } from './actions.ts';

/** What was pressed inside the message, read from the event's target. */
export interface MenuTarget {
  link?: string;
  image?: { src: string; original: string; name: string };
}

export function targetOf(event: Event | undefined): MenuTarget {
  const el = event?.target instanceof Element ? event.target : null;
  const target: MenuTarget = {};
  const a = el?.closest<HTMLAnchorElement>('a[href]');
  if (a && /^https?:/.test(a.href) && new URL(a.href).origin !== location.origin) target.link = a.href;
  const img = el?.closest<HTMLImageElement>('img[data-original]');
  if (img) {
    const original = img.dataset.original!;
    const name = img.dataset.name ?? (decodeURIComponent(new URL(original, location.href).pathname.split('/').pop() ?? '') || 'image');
    target.image = { src: img.currentSrc || img.src, original, name };
  }
  return target;
}

/** One quick reaction: a Unicode emoji or a custom one, as the picker hands them over. */
export interface QuickEmoji {
  key: string;
  label: string;
  text?: string;
  image?: string;
}

interface Options {
  own: boolean;
  /** Whether "Mark unread" can work here: not for a pending message. */
  canMarkUnread: boolean;
  quick: QuickEmoji[];
  target: MenuTarget;
  /** The message's element, for anchoring the reaction picker. */
  anchor: HTMLElement;
}

export function messageMenu(msg: Message, a: MessageActions, o: Options): MenuItem[] {
  const groups: MenuItem[][] = [];
  if (a.react) {
    groups.push([
      { kind: 'row', label: m.actions.quickReactions, items: o.quick.map((q) => ({ label: m.actions.reactWith(q.label), text: q.text, image: q.image, onselect: () => a.quickReact(msg, q.key) })) },
      { label: m.actions.react, onselect: () => a.pickReaction(msg, o.anchor) },
    ]);
  }
  const main: MenuItem[] = [];
  if (o.own && msg.content) main.push({ label: m.actions.edit, onselect: () => a.edit(msg) });
  if (a.send) main.push({ label: m.actions.reply, onselect: () => a.reply(msg) });
  if (a.manage) main.push({ label: msg.pinned ? m.actions.unpin : m.actions.pin, onselect: () => a.pin(msg) });
  if (o.canMarkUnread) main.push({ label: m.actions.markUnread, onselect: () => a.markUnread(msg) });
  if (msg.content) main.push({ label: m.actions.copyText, onselect: () => a.copyText(msg) });
  main.push({ label: m.actions.copyLink, onselect: () => a.copyLink(msg) }, { label: m.actions.copyId, onselect: () => a.copyId(msg) });
  groups.push(main);
  const { link, image } = o.target;
  if (link) groups.push([{ label: m.actions.openLink, onselect: () => a.openUrl(link) }, { label: m.actions.copyUrl, onselect: () => a.copyUrl(link) }]);
  if (image) {
    groups.push([
      { label: m.actions.copyImage, onselect: () => a.copyImage(image.src) },
      { label: m.actions.saveImage, onselect: () => a.saveImage(image.src, image.name) },
      { label: m.actions.openOriginal, onselect: () => a.openUrl(image.original) },
    ]);
  }
  if (o.own || a.manage) groups.push([{ label: m.actions.delete, danger: true, onselect: () => a.delete(msg, false) }]);
  return groups.flatMap((g, i) => (i ? ['separator' as const, ...g] : g));
}
