// See https://svelte.dev/docs/kit/types#app.d.ts
import type { SettingsTarget } from '$lib/settings/modal.svelte.ts';

declare global {
  namespace App {
    interface PageState {
      /** Settings open over the shell, by shallow routing (m4.6-plan.md task 16a). */
      settings?: SettingsTarget;
    }
  }
}
export {};
