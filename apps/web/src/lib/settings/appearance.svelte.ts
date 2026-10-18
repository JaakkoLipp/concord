/**
 * Appearance (M4.8 task 15): the compact message layout and the font size, per device in localStorage. The font
 * size scales the root, so everything in rem follows, relative to the browser's own size (16 px by default).
 * `static/app/appearance.js` applies both before the first paint; this keeps them applied as they change.
 */
const KEY = 'concord:appearance';
export const FONT_SIZES = [12, 14, 15, 16, 18, 20, 24] as const;
export const DEFAULT_FONT_SIZE = 16;

export interface AppearancePrefs { compact: boolean; fontSize: number }

export function parseAppearance(raw: string | null): AppearancePrefs {
  try {
    const a = JSON.parse(raw ?? '{}') as Partial<AppearancePrefs>;
    return {
      compact: a.compact === true,
      fontSize: typeof a.fontSize === 'number' && (FONT_SIZES as readonly number[]).includes(a.fontSize) ? a.fontSize : DEFAULT_FONT_SIZE,
    };
  } catch {
    return { compact: false, fontSize: DEFAULT_FONT_SIZE };
  }
}

function stored(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

class Appearance {
  compact = $state(false);
  fontSize = $state(DEFAULT_FONT_SIZE);

  constructor() {
    if (typeof localStorage === 'undefined') return;
    const a = parseAppearance(stored());
    this.compact = a.compact;
    this.fontSize = a.fontSize;
  }

  set(change: Partial<AppearancePrefs>): void {
    if (change.compact !== undefined) this.compact = change.compact;
    if (change.fontSize !== undefined) this.fontSize = change.fontSize;
    try {
      localStorage.setItem(KEY, JSON.stringify({ compact: this.compact, fontSize: this.fontSize }));
    } catch {
      // Private mode or full storage: it lasts until the page is closed.
    }
    const root = document.documentElement;
    root.toggleAttribute('data-compact', this.compact);
    root.style.fontSize = this.fontSize === DEFAULT_FONT_SIZE ? '' : `${(this.fontSize / DEFAULT_FONT_SIZE) * 100}%`;
  }
}

export const appearance = new Appearance();
