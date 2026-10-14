/**
 * Leaving an editor with unsaved changes asks first, as the profile editor does. Call during component setup.
 * Closing the tab gets the browser's own question.
 */
import { beforeNavigate, goto } from '$app/navigation';
import { m } from '$lib/i18n/index.ts';
import { confirm } from '$lib/view/confirm.svelte.ts';

export function guardUnsaved(dirty: () => boolean, reset: () => void): void {
  beforeNavigate((nav) => {
    if (!dirty()) return;
    if (nav.type === 'leave') return nav.cancel();
    const to = nav.to?.url;
    nav.cancel();
    void confirm.ask({ title: m.admin.leaveUnsavedTitle, body: m.admin.leaveUnsavedBody, confirm: m.admin.leaveUnsaved, danger: true }).then((ok) => {
      if (!ok || !to) return;
      reset();
      // eslint-disable-next-line svelte/no-navigation-without-resolve -- the URL came from a navigation already resolved
      void goto(to);
    });
  });
}
