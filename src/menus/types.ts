/**
 * Typed menu declaration. Menus are pure DATA — items reference a `commandId`
 * that resolves in the command registry; dynamic values (enabled, checked,
 * badge) are computed there from editor state, never stored here.
 */

export interface MenuItemSpec {
  /** Command id — resolves in the registry. Unknown / run-less ids render disabled. */
  id: string;
  label: string;
  /** Portable accelerator (e.g. "Mod-N", "Mod-Shift-Z"); rendered per platform. */
  shortcut?: string;
  /** Right-slot muted hint text (e.g. ".docx .md", "@", "Ω"). */
  hint?: string;
  /** Leading glyph shown before the label (e.g. "{ }" for Variable). */
  glyph?: string;
  /** Nested items → renders a ▸ submenu. */
  submenu?: MenuNode[];
  /** Toggle rendering + ARIA role. */
  role?: 'checkbox' | 'radio';
  /** Radio group key (items with the same key form one ✓-exclusive group). */
  radioGroup?: string;
  /** Destructive styling (red) + confirmation before dispatch. */
  destructive?: boolean;
  /** AI item: ✦ prefix, teal label. */
  ai?: boolean;
}

export type MenuNode = MenuItemSpec | { divider: true };

export interface MenuSpec {
  /** Menu id (stable key). */
  id: string;
  /** Trigger label in the bar. */
  label: string;
  items: MenuNode[];
  /** Help menu: pins a search field that filters ALL commands across every menu. */
  search?: boolean;
}

export function isDivider(node: MenuNode): node is { divider: true } {
  return (node as { divider?: true }).divider === true;
}
