/**
 * Where the shell loads the client from (m5-plan.md decision 2), and what happens to every link and navigation the
 * page starts (decision 3): the client's own pages stay in the window, the web opens in the system browser, and
 * anything else is dropped.
 */
export const PRODUCTION_URL = 'https://concord.jaalip.com/app';

// Our own invite links, as the client makes them (`<origin>/invite/<code>`), go to the client's invite route.
const INVITE = /^\/invite\/([A-Za-z0-9]{1,32})\/?$/;
const EXTERNAL = new Set(['https:', 'http:', 'mailto:']);

export type Link = { kind: 'app'; url: string } | { kind: 'external'; url: string } | { kind: 'drop' };

/** Production's client, or in an unpackaged build the `CONCORD_URL` it was started with. */
export function clientUrl(packaged: boolean, override: string | undefined): URL {
  const url = !packaged && override ? URL.parse(override) : null;
  return url && (url.protocol === 'https:' || url.protocol === 'http:') ? url : new URL(PRODUCTION_URL);
}

/** Decides a link the page opens, or a navigation of the window, given the client's origin. */
export function route(url: string, origin: string): Link {
  const target = URL.parse(url);
  if (!target) return { kind: 'drop' };
  if (target.origin === origin) {
    const invite = INVITE.exec(target.pathname);
    if (invite) return { kind: 'app', url: `${origin}/app/invite/${invite[1]}` };
    if (target.pathname === '/app' || target.pathname.startsWith('/app/')) return { kind: 'app', url: target.href };
  }
  // The website's own pages, like every other site, open in the browser.
  if (EXTERNAL.has(target.protocol)) return { kind: 'external', url: target.href };
  return { kind: 'drop' };
}
