/**
 * Unsent composer text per channel, with the caret position, kept while the tab is open
 * (m2a-plan.md decision 6), keyed by account and channel. Cleared on logout; the account in the key keeps
 * a draft written back while the composer unmounts from reaching the next account.
 */
export const drafts = new Map<string, { text: string; caret: number }>();
