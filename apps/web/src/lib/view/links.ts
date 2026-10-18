/**
 * Masked links (M4.8 task 14a): a link whose text isn't its own address asks before it opens, as on Discord. One
 * check for links in messages, the message menu's Open link, and links in senders' own embeds.
 */
import { m } from '$lib/i18n/index.ts';
import { confirm } from './confirm.svelte.ts';

const bare = (s: string) => {
  let t = s.trim();
  try {
    t = decodeURI(t);
  } catch {
    // Keep it encoded.
  }
  return t.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '').toLowerCase();
};

/** Whether `text` shows something other than where `href` goes. */
export function masked(text: string, href: string): boolean {
  let full = href;
  try {
    full = new URL(href).href;
  } catch {
    return true;
  }
  const shown = bare(text);
  return shown !== bare(full) && shown !== bare(href);
}

/** Opens a web address in a new tab, asking first when the text it was shown as isn't the address. */
export async function visit(href: string, text?: string): Promise<void> {
  if (text !== undefined && masked(text, href)
    && !(await confirm.ask({ title: m.links.leaveTitle, body: m.links.leaveBody(href), confirm: m.links.visit }))) return;
  window.open(href, '_blank', 'noopener,noreferrer');
}

/** Click and middle-click on a link: a masked one asks first instead of opening. `text` defaults to the link's own. */
export function guardLink(e: MouseEvent, text?: string): void {
  const a = e.currentTarget;
  if (!(a instanceof HTMLAnchorElement) || (e.type === 'auxclick' && e.button !== 1)) return;
  const shown = text ?? a.textContent ?? '';
  if (!masked(shown, a.href)) return;
  e.preventDefault();
  void visit(a.href, shown);
}
