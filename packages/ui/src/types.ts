export type PresenceState = 'online' | 'idle' | 'busy' | 'focus' | 'offline';

/** One tab in a Tabs row. */
export interface Tab { id: string; label: string; badge?: number | undefined; badgeLabel?: string | undefined }

/** One entry in a Menu: an action, a checkbox, a slider, a row of small buttons, or a separator line. */
export type MenuItem = MenuSubItem | MenuSub;
/** What a submenu may hold: everything but another submenu. */
export type MenuSubItem = MenuAction | MenuCheck | MenuRange | MenuRow | 'separator';
export interface MenuAction { kind?: 'action'; label: string; onselect: () => void; danger?: boolean; disabled?: boolean }
/**
 * A setting that is on or off. Picking it toggles it and closes the menu, unless `stay` is set: then the menu stays open
 * and the box flips at once, as for the checkboxes of a person's roles.
 */
export interface MenuCheck { kind: 'check'; label: string; checked: boolean; onselect: () => unknown; stay?: boolean }
/**
 * An item that opens a menu of its own, to the side: by hover, click or the Right arrow. One level deep. `detail` is a
 * second line under the label, such as the current setting.
 */
export interface MenuSub { kind: 'submenu'; label: string; items: MenuSubItem[]; detail?: string }

/** A slider that keeps the menu open while it moves, such as a user's volume. */
export interface MenuRange {
  kind: 'range'; label: string; value: number; min: number; max: number; step?: number;
  /** The value as shown beside the label, such as "120%". */
  format: (value: number) => string;
  oninput: (value: number) => void;
}
/** A row of small buttons, such as quick reactions. Each shows a character or an image, and is named by its label. */
export interface MenuRow {
  kind: 'row'; label: string;
  items: { label: string; text?: string | undefined; image?: string | undefined; onselect: () => void }[];
}
