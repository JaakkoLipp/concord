/**
 * Unsent composer text per channel, with the caret position, kept while the tab is open
 * (m2a-plan.md decision 6). Cleared on logout.
 */
export const drafts = new Map<string, { text: string; caret: number }>();
