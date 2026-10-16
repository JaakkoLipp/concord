/**
 * The keyboard shortcuts dialog's state (M4.8 task 1), in the pattern of confirm.svelte.ts. `still` is set when
 * the dialog is opened from the keyboard, so it doesn't animate (client.md section 9, rule 2).
 */
class ShortcutsDialog {
  open = $state(false);
  still = $state(false);

  show(fromKeyboard = false): void {
    this.still = fromKeyboard;
    this.open = true;
  }

  close(): void {
    this.open = false;
  }
}

export const shortcutsDialog = new ShortcutsDialog();
