// Probe 0.5, Wayland: the XDG GlobalShortcuts portal over plain D-Bus. Logs the portal's version, what the system
// bound, and every Activated and Deactivated, so press and release can be checked while a game has focus.
const dbus = require('dbus-native');

const DEST = 'org.freedesktop.portal.Desktop';
const PATH = '/org/freedesktop/portal/desktop';
const IFACE = 'org.freedesktop.portal.GlobalShortcuts';
const REQUEST = 'org.freedesktop.portal.Request';

let bus;
let listening = false;
let sessionHandle;
let tokens = 0;

async function connect(log) {
  if (!bus) {
    bus = dbus.sessionBus();
    await bus.getId(); // Hello is answered first, so bus.name is set from here on
  }
  if (log && !listening) {
    listening = true;
    for (const member of ['Activated', 'Deactivated', 'ShortcutsChanged']) {
      await bus.addMatch(`type='signal',interface='${IFACE}',member='${member}'`);
      bus.signals.on(bus.mangle(PATH, IFACE, member), (body) => {
        const [session, id, timestamp] = body;
        if (member === 'ShortcutsChanged') return log('portal', { member, shortcuts: body[1] });
        log('portal', { member, id, timestamp: Number(timestamp), ours: session === sessionHandle });
      });
    }
  }
  return bus;
}

// A portal call answers with a Request object at once, and the result arrives later as its Response signal, after
// any dialog. The match is added before the call, on the path the portal will use, so a fast reply isn't missed.
async function request(member, signature, body, options) {
  const token = `concord${process.pid}_${++tokens}`;
  const path = `${PATH}/request/${bus.name.slice(1).replace(/\./g, '_')}/${token}`;
  await bus.addMatch(`type='signal',interface='${REQUEST}',member='Response',path='${path}'`);
  const response = new Promise((resolve) => bus.signals.once(bus.mangle(path, REQUEST, 'Response'), resolve));
  await bus.invoke({ destination: DEST, path: PATH, interface: IFACE, member, signature, body: [...body, { handle_token: token, ...options }] });
  const [code, results] = await response;
  // 0 success, 1 cancelled by the user, 2 other.
  return { code, results };
}

async function version() {
  try {
    await connect();
    const v = await bus.invoke({ destination: DEST, path: PATH, interface: 'org.freedesktop.DBus.Properties', member: 'Get', signature: 'ss', body: [IFACE, 'version'] });
    return { version: v };
  } catch (error) {
    return { error: String(error.message ?? error) };
  }
}

async function bind(triggers, log) {
  await connect(log);
  if (!sessionHandle) {
    const created = await request('CreateSession', 'a{sv}', [], { session_handle_token: `concord${process.pid}` });
    if (created.code !== 0) return { step: 'CreateSession', ...created };
    sessionHandle = created.results.session_handle;
  }
  const shortcuts = Object.entries(triggers).map(([id, trigger]) => [id, { description: `Concord probe: ${id}`, preferred_trigger: trigger }]);
  const bound = await request('BindShortcuts', 'oa(sa{sv})sa{sv}', [sessionHandle, shortcuts, ''], {});
  return { step: 'BindShortcuts', session: sessionHandle, ...bound, hyprland: `bind = SUPER, F9, global, ${process.env.FLATPAK_ID ?? 'com.jaalip.ConcordProbe'}:ptt` };
}

async function list() {
  if (!sessionHandle) return { error: 'bind first' };
  return request('ListShortcuts', 'oa{sv}', [sessionHandle], {});
}

module.exports = { version, bind, list };
