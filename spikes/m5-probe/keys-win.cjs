// Probe 0.4, Windows: key down and up from uiohook-napi's low-level hook (WH_KEYBOARD_LL) and from Raw Input with
// RIDEV_INPUTSINK, so the two can be compared while a game, or an elevated window, has focus.
const koffi = require('koffi');

const WM_INPUT = 0x00ff;
const RIDEV_REMOVE = 0x0001;
const RIDEV_INPUTSINK = 0x0100;
const RID_INPUT = 0x10000003;
const RIM_TYPEKEYBOARD = 1;
const RI_KEY_BREAK = 0x01;
const RI_KEY_E0 = 0x02;
// sizeof(RAWINPUTHEADER) on x64: dwType, dwSize, hDevice, wParam.
const HEADER_SIZE = 24;

const user32 = koffi.load('user32.dll');
const RAWINPUTDEVICE = koffi.struct('RAWINPUTDEVICE', { usUsagePage: 'uint16_t', usUsage: 'uint16_t', dwFlags: 'uint32_t', hwndTarget: 'uintptr_t' });
const RegisterRawInputDevices = user32.func('__stdcall', 'RegisterRawInputDevices', 'bool', [koffi.pointer(RAWINPUTDEVICE), 'uint32_t', 'uint32_t']);
const GetRawInputData = user32.func('__stdcall', 'GetRawInputData', 'uint32_t', ['uintptr_t', 'uint32_t', 'void *', koffi.inout(koffi.pointer('uint32_t')), 'uint32_t']);
const GetLastError = koffi.load('kernel32.dll').func('__stdcall', 'GetLastError', 'uint32_t', []);

// Auto-repeat sends repeated downs: only the first down and the up are logged, with the repeat count on the up.
function tracker(source, log) {
  const held = new Map();
  return (key, down, extra) => {
    if (down) {
      if (held.has(key)) return held.set(key, held.get(key) + 1);
      held.set(key, 0);
      log('key', { source, key, state: 'down', ...extra });
    } else {
      log('key', { source, key, state: 'up', repeats: held.get(key) ?? null, ...extra });
      held.delete(key);
    }
  };
}

let hookStarted = false;
function hook(on, log) {
  const { uIOhook } = require('uiohook-napi');
  if (on && !hookStarted) {
    const track = tracker('hook', log);
    const mods = (e) => ({ ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey });
    uIOhook.on('keydown', (e) => track(`0x${e.keycode.toString(16)}`, true, mods(e)));
    uIOhook.on('keyup', (e) => track(`0x${e.keycode.toString(16)}`, false, mods(e)));
    uIOhook.start();
    hookStarted = true;
  } else if (!on && hookStarted) {
    uIOhook.stop();
    uIOhook.removeAllListeners();
    hookStarted = false;
  }
  return { hook: hookStarted };
}

let rawWindow = null;
function rawInput(on, win, log) {
  const hwnd = Number(win.getNativeWindowHandle().readBigUInt64LE(0));
  if (on && !rawWindow) {
    const ok = RegisterRawInputDevices({ usUsagePage: 0x01, usUsage: 0x06, dwFlags: RIDEV_INPUTSINK, hwndTarget: hwnd }, 1, koffi.sizeof(RAWINPUTDEVICE));
    if (!ok) return { rawInput: false, error: GetLastError() };
    const track = tracker('rawinput', log);
    const buf = Buffer.alloc(64);
    win.hookWindowMessage(WM_INPUT, (wParam, lParam) => {
      const size = [buf.length];
      const read = GetRawInputData(Number(lParam.readBigUInt64LE(0)), RID_INPUT, buf, size, HEADER_SIZE);
      if (read === 0xffffffff || buf.readUInt32LE(0) !== RIM_TYPEKEYBOARD) return;
      const makeCode = buf.readUInt16LE(HEADER_SIZE);
      const flags = buf.readUInt16LE(HEADER_SIZE + 2);
      const vkey = buf.readUInt16LE(HEADER_SIZE + 6);
      // wParam is RIM_INPUT (0) while our window has focus and RIM_INPUTSINK (1) while another one does.
      const background = wParam.readBigUInt64LE(0) === 1n;
      track(`vk 0x${vkey.toString(16)}`, !(flags & RI_KEY_BREAK), { makeCode, e0: Boolean(flags & RI_KEY_E0), background });
    });
    rawWindow = win;
  } else if (!on && rawWindow) {
    RegisterRawInputDevices({ usUsagePage: 0x01, usUsage: 0x06, dwFlags: RIDEV_REMOVE, hwndTarget: 0 }, 1, koffi.sizeof(RAWINPUTDEVICE));
    rawWindow.unhookWindowMessage(WM_INPUT);
    rawWindow = null;
  }
  return { rawInput: Boolean(rawWindow) };
}

module.exports = { hook, rawInput };
