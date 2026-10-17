/**
 * Leaving an editor with unsaved changes asks first, as the profile editor does. Call during component setup.
 * A real navigation asks through beforeNavigate. Closing settings, Back and a section switch are shallow, so the
 * settings modal asks for them (m4.6-plan.md task 16a). Closing the tab gets the browser's own question.
 */
import { beforeNavigate, goto } from '$app/navigation';
import { confirm, type Question } from '$lib/view/confirm.svelte.ts';
import { settingsModal, unsavedQuestion } from '$lib/settings/modal.svelte.ts';

export function guardUnsaved(dirty: () => boolean, reset: () => void, question: Question = unsavedQuestion()): void {
  settingsModal.guard({ dirty, reset, question });
  beforeNavigate((nav) => {
    if (!dirty()) return;
    if (nav.type === 'leave') return nav.cancel();
    const to = nav.to?.url;
    nav.cancel();
    void confirm.ask({ ...question, danger: true }).then((ok) => {
      if (!ok || !to) return;
      reset();
      // eslint-disable-next-line svelte/no-navigation-without-resolve -- the URL came from a navigation already resolved
      void goto(to);
    });
  });
}
