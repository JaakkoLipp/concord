/**
 * Ctrl+K opens the quick switcher, or closes it when it's open (M4.8 task 3). Registered here, and Shell.svelte
 * imports this file for that side effect. Firefox uses Ctrl+K for its search bar; the registry's preventDefault
 * covers it. Opened from the keyboard, so the switcher doesn't animate (client.md section 9, rule 2).
 */
import { m } from '../i18n/index.ts';
import { switcher } from '../view/switcher.svelte.ts';
import { register, somethingOpen } from './shortcuts.ts';

register({
  id: 'quick-switcher',
  keys: { code: 'KeyK', key: 'K', ctrl: true, shift: false, alt: false, meta: false },
  label: m.switcher.shortcut,
  // No `when` guard: the key is always taken, so it never falls through to Firefox's search bar, even during the
  // switcher's own exit. It opens only when no other dialog, menu, popover or picker is open, as the plan says.
  run: () => {
    if (switcher.open) switcher.close();
    else if (!somethingOpen()) switcher.show(true);
  },
});
