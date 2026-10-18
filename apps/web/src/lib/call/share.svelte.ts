/** Whether the share dialog is open (client.md section 10.6). The call view and the voice panel both open it. */
class ShareDialogState {
  open = $state(false);
}

export const shareDialog = new ShareDialogState();

/** Whether the strip under a focused tile is folded away (m4.6-plan.md task 12b), for the rest of the session. */
class StageViewState {
  membersHidden = $state(false);
}

export const stageView = new StageViewState();
