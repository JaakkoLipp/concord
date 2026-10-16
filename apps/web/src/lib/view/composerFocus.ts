/**
 * The composer's focus hook (M4.8 task 2b). Composer.svelte registers a focus function while its editor is live and
 * takes text, which only happens on a channel route the user can send in; typeToFocus.ts calls it when a key is typed
 * with nothing focused. Kept apart from both, so neither imports the other.
 */
export type ComposerFocus = () => boolean;

let focus: ComposerFocus | null = null;

/** Set by Composer.svelte while it can take text, and cleared (null) when it can't or is destroyed. */
export function setComposerFocus(fn: ComposerFocus | null): void {
  focus = fn;
}

/** Whether the composer is on screen and takes text in this channel. */
export function composerReady(): boolean {
  return focus !== null;
}

/** Moves focus into the composer. Returns whether it landed there. */
export function focusComposer(): boolean {
  return focus?.() ?? false;
}
