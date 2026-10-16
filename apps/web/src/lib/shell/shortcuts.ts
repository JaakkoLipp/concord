/**
 * The app's keyboard shortcuts (M4.8 task 1): one registry, one listener in Shell.svelte, and the list the
 * shortcuts dialog shows. Each key combination belongs to one entry, so the voice keybind recorder can refuse
 * a key the registry owns.
 */
import { m } from '../i18n/index.ts';
import { shortcutsDialog } from '../view/shortcutsDialog.svelte.ts';
import { matches, sameKeybind, type Keybind } from '../voice/keybinds.ts';

export interface Shortcut {
  id: string;
  keys: Keybind;
  /** What the shortcut does, as the shortcuts dialog names it. */
  label: string;
  run: () => void;
  /**
   * Checked before a key press counts as this shortcut. When it says no, the press goes on to the page as if
   * nothing were registered, and the default isn't prevented. The global Esc uses it (M4.8 task 2).
   */
  when?: (e: ShortcutEvent) => boolean;
}

/** The part of a keyboard event the registry reads. The target and defaultPrevented are optional for callers that have no event. */
export type ShortcutEvent = Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey' | 'repeat' | 'preventDefault'>
  & Partial<Pick<KeyboardEvent, 'target' | 'defaultPrevented'>>;

const entries = new Map<string, Shortcut>();

/** True while the voice keybind recorder is waiting for a key, so the registry stays silent (plan, decisions). */
export let recording = false;
export function setRecording(on: boolean): void {
  recording = on;
}

/** Adds a shortcut. Throws on a duplicate id or a key combination another entry already owns. */
export function register(entry: Shortcut): void {
  if (entries.has(entry.id)) throw new Error(`Shortcut "${entry.id}" is already registered`);
  const owner = ownedBy(entry.keys);
  if (owner) throw new Error(`Shortcut "${entry.id}" uses the keys of "${owner.id}"`);
  entries.set(entry.id, entry);
}

/** Every registered shortcut, in the order they were registered. */
export function list(): Shortcut[] {
  return [...entries.values()];
}

/** The entry that owns this key combination, if any. */
export function ownedBy(keybind: Keybind): Shortcut | undefined {
  for (const entry of entries.values()) if (sameKeybind(entry.keys, keybind)) return entry;
  return undefined;
}

/**
 * Runs the shortcut this key press matches, and says whether it did. Does nothing while a keybind is being
 * recorded, and for key repeats, so holding a key runs its shortcut once.
 */
export function handle(e: ShortcutEvent): boolean {
  if (recording || e.repeat) return false;
  for (const entry of entries.values()) {
    if (!matches(entry.keys, e)) continue;
    if (entry.when && !entry.when(e)) continue;
    e.preventDefault();
    entry.run();
    return true;
  }
  return false;
}

/** Whether something takes the keyboard while open, so the navigation shortcuts and the global Esc wait (M4.8 task 2). */
const OPEN_SURFACES = [
  'dialog[open]', // Dialog, ImageViewer, DeleteDialog: native dialogs, open only while shown
  '[role="menu"]', // Menu, and the message action bar's More menu: rendered only while open
  '[role="dialog"]', // Popover (the emoji and GIF pickers) and the settings frame
  '[role="listbox"]', // the composer's autocomplete list
].join(', ');

export function somethingOpen(): boolean {
  return typeof document !== 'undefined' && document.querySelector(OPEN_SURFACES) !== null;
}

/** The element an event was aimed at, when it has one. */
function targetElement(e: { target?: EventTarget | null | undefined }): Element | null {
  const t = e.target as Partial<Element> | null | undefined;
  return t && typeof t.closest === 'function' ? (t as Element) : null;
}

/** Whether the press is aimed at something a key types into: an input, a textarea, a select or an editor. */
export function typingTarget(e: { target?: EventTarget | null | undefined }): boolean {
  return !!targetElement(e)?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])');
}

/** Whether the press is aimed inside a dialog or a popover. */
export function insideDialog(e: { target?: EventTarget | null | undefined }): boolean {
  return !!targetElement(e)?.closest('dialog, [role="dialog"]');
}

register({
  id: 'shortcuts-list',
  keys: { code: 'Slash', key: '/', ctrl: true, shift: false, alt: false, meta: false },
  label: m.shortcuts.list,
  // Opened from the keyboard, so the dialog doesn't animate (client.md section 9, rule 2).
  run: () => shortcutsDialog.show(true),
});
