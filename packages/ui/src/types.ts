export type PresenceState = 'online' | 'idle' | 'busy' | 'focus' | 'offline';

/** One tab in a Tabs row. */
export interface Tab { id: string; label: string; badge?: number | undefined; badgeLabel?: string | undefined }

/** One entry in a Menu: an action, or a separator line. */
export type MenuItem = { label: string; onselect: () => void; danger?: boolean; disabled?: boolean } | 'separator';
