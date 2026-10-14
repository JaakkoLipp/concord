export type PresenceState = 'online' | 'idle' | 'busy' | 'focus' | 'offline';

/** One tab in a Tabs row. */
export interface Tab { id: string; label: string; badge?: number | undefined; badgeLabel?: string | undefined }

/** One entry in a Menu: an action, a checkbox, a slider, or a separator line. */
export type MenuItem = MenuAction | MenuCheck | MenuRange | 'separator';
export interface MenuAction { kind?: 'action'; label: string; onselect: () => void; danger?: boolean; disabled?: boolean }
/** A setting that is on or off. Picking it toggles it and closes the menu. */
export interface MenuCheck { kind: 'check'; label: string; checked: boolean; onselect: () => void }
/** A slider that keeps the menu open while it moves, such as a user's volume. */
export interface MenuRange {
  kind: 'range'; label: string; value: number; min: number; max: number; step?: number;
  /** The value as shown beside the label, such as "120%". */
  format: (value: number) => string;
  oninput: (value: number) => void;
}
