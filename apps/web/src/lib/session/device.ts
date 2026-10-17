/**
 * The name a new session gets at login, such as "Concord on Firefox, Linux", so the account page's session list
 * (M4.8 task 8) says which device is which. Read from the user agent: a guess, and only a label.
 */
import { m } from '$lib/i18n/index.ts';

// Order matters: Edge and Opera also say Chrome, Chrome also says Safari, and Android also says Linux.
const BROWSERS: [RegExp, string][] = [[/Edg(e|A|iOS)?\//, 'Edge'], [/OPR\/|Opera/, 'Opera'], [/Firefox\/|FxiOS/, 'Firefox'], [/Chrome\/|CriOS/, 'Chrome'], [/Safari\//, 'Safari']];
const SYSTEMS: [RegExp, string][] = [[/Windows/, 'Windows'], [/Android/, 'Android'], [/iPhone|iPad|iPod/, 'iOS'], [/Mac OS X|Macintosh/, 'macOS'], [/CrOS/, 'ChromeOS'], [/Linux/, 'Linux']];

const find = (list: [RegExp, string][], ua: string) => list.find(([re]) => re.test(ua))?.[1];

export function deviceName(ua: string): string {
  const what = [find(BROWSERS, ua), find(SYSTEMS, ua)].filter(Boolean).join(', ');
  return what ? m.account.deviceName(what) : m.app.name;
}
