/**
 * The navigation shortcuts and the global Esc (M4.8 task 2). Each registers with shortcuts.ts, whose one listener
 * Shell.svelte mounts; Shell imports this file for that side effect. Each run reads the session and the route at
 * the time of the press. The shell only mounts on the channel routes, and its listener waits while settings is
 * open over it, so settings and invites never reach these.
 */
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { page } from '$app/state';
import { m } from '$lib/i18n/index.ts';
import { app } from '$lib/session/app.svelte.ts';
import { firstChannel, recalled } from '$lib/view/channels.ts';
import { dmChannelIds, serverChannelIds, serverIds, stepChannel, stepServer, stepUnread, unreadShown, type Direction } from '$lib/view/stepping.ts';
import { insideDialog, register, somethingOpen, typingTarget } from './shortcuts.ts';

/** Where the route is: a server's channel, the direct messages area, or nowhere the shell shows. */
type Area = { kind: 'server'; server: string; channel: string | null } | { kind: 'dm'; channel: string | null };

function area(): Area | null {
  const route = page.route.id;
  if (route === '/(app)/app/channels/[server]/[channel]/[[message]]') return { kind: 'server', server: page.params.server ?? '', channel: page.params.channel ?? null };
  if (route === '/(app)/app/channels/@me/[channel]/[[message]]') return { kind: 'dm', channel: page.params.channel ?? null };
  if (route === '/(app)/app/channels/@me') return { kind: 'dm', channel: null };
  return null;
}

const toChannel = (server: string, channel: string) => goto(resolve('/(app)/app/channels/[server]/[channel]/[[message]]', { server, channel }));
const toDm = (channel: string) => goto(resolve('/(app)/app/channels/@me/[channel]/[[message]]', { channel }));

/** Alt+Up and Alt+Down, and with Shift the unread ones: the next channel of this server, or DM, in sidebar order. */
function stepWithin(dir: Direction, unread: boolean): void {
  const session = app.session;
  const here = area();
  if (!session || !here) return;
  const store = session.store;
  const ids = here.kind === 'server' ? serverChannelIds(store, here.server, here.channel) : dmChannelIds(store);
  const next = unread ? stepUnread(ids, here.channel, dir, unreadShown(store)) : stepChannel(ids, here.channel, dir);
  if (!next) return;
  if (here.kind === 'server') void toChannel(here.server, next);
  else void toDm(next);
}

/** Ctrl+Alt+Up and Ctrl+Alt+Down: the next server in the rail, opened where the rail would open it. */
function stepRail(dir: Direction): void {
  const session = app.session;
  const here = area();
  if (!session || !here) return;
  const current = here.kind === 'server' ? here.server : null;
  const next = stepServer(serverIds(session.store), current, dir);
  if (!next) return;
  // As ServerRail's href: the channel last visited there, else its first, else the friends screen.
  const channel = recalled(next) ?? firstChannel(session.store, next);
  void (channel ? toChannel(next, channel) : goto(resolve('/app/channels/@me')));
}

/** Off the surfaces that take the keyboard, on a route the shell shows. */
const navigable = () => !somethingOpen() && area() !== null;

const key = (code: string, mods: { alt?: boolean; ctrl?: boolean; shift?: boolean } = {}) => ({
  code, key: code, ctrl: !!mods.ctrl, shift: !!mods.shift, alt: !!mods.alt, meta: false,
});

// Alt keys don't type text, so these work in the composer too: the registry's listener is in capture phase,
// and CodeMirror ignores a key press that is already default-prevented, so its Alt+Arrow line moves don't run.
register({ id: 'channel-next', keys: key('ArrowDown', { alt: true }), label: m.shortcutNav.channelNext, when: navigable, run: () => stepWithin('down', false) });
register({ id: 'channel-previous', keys: key('ArrowUp', { alt: true }), label: m.shortcutNav.channelPrevious, when: navigable, run: () => stepWithin('up', false) });
register({ id: 'unread-next', keys: key('ArrowDown', { alt: true, shift: true }), label: m.shortcutNav.unreadNext, when: navigable, run: () => stepWithin('down', true) });
register({ id: 'unread-previous', keys: key('ArrowUp', { alt: true, shift: true }), label: m.shortcutNav.unreadPrevious, when: navigable, run: () => stepWithin('up', true) });
register({ id: 'server-next', keys: key('ArrowDown', { alt: true, ctrl: true }), label: m.shortcutNav.serverNext, when: navigable, run: () => stepRail('down') });
register({ id: 'server-previous', keys: key('ArrowUp', { alt: true, ctrl: true }), label: m.shortcutNav.serverPrevious, when: navigable, run: () => stepRail('up') });

// The global Esc marks the open channel read, but only where no other Escape has a job: not in a field, a dialog
// or a menu, and not after something else has used the press. The composer's own Escape (cancel a reply, else
// mark read) is in a field, so it stays the composer's.
register({
  id: 'read-channel',
  keys: key('Escape'),
  label: m.shortcutNav.markRead,
  when: (e) => !e.defaultPrevented && !typingTarget(e) && !insideDialog(e) && navigable() && !!area()?.channel,
  run: () => {
    const here = area();
    if (here?.channel && app.session) app.session.markRead(here.channel);
  },
});
