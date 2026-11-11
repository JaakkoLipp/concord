/**
 * Spoiler attachments (m4.3-plan.md task 2): a file named `SPOILER_…`, as on Discord, is covered until clicked. The
 * name is the whole mechanism, so other clients show such a file as any other.
 */
export const SPOILER_PREFIX = 'SPOILER_';
export const isSpoiler = (name: string) => name.startsWith(SPOILER_PREFIX);
/** The name with the spoiler mark put on or taken off. */
export const withSpoiler = (name: string, on: boolean) => (on ? (isSpoiler(name) ? name : SPOILER_PREFIX + name) : name.replace(/^(SPOILER_)+/, ''));
