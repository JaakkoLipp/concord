/** Whether the share dialog is open (client.md section 10.6). The call view and the voice panel both open it. */
class ShareDialogState {
  open = $state(false);
}

export const shareDialog = new ShareDialogState();
