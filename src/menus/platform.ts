/**
 * Platform-aware keyboard-shortcut rendering. Shortcuts are declared portably
 * as hyphen-joined tokens (e.g. "Mod-N", "Mod-Shift-Z", "Ctrl-Mod-F", "Mod-/")
 * and formatted per platform: ⌘/⌥/⌃/⇧ on macOS, "Ctrl+…"/"Alt+…"/"Shift+…"
 * elsewhere.
 *
 *   Mod   → ⌘ (mac) / Ctrl (win/linux)   — the primary accelerator
 *   Ctrl  → ⌃ (mac) / Ctrl               — the literal control key
 *   Alt   → ⌥ (mac) / Alt
 *   Shift → ⇧ (mac) / Shift
 */

export const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);

const MAC_SYMBOL: Record<string, string> = { Mod: '⌘', Ctrl: '⌃', Alt: '⌥', Shift: '⇧' };
const OTHER_WORD: Record<string, string> = { Mod: 'Ctrl', Ctrl: 'Ctrl', Alt: 'Alt', Shift: 'Shift' };
// Display order: literal Ctrl, then the primary (Mod), then Alt, then Shift —
// yields ⌃⌘F (Full screen) and ⌘⇧Z / Ctrl+Shift+Z (Redo) per the mockup.
const MOD_ORDER = ['Ctrl', 'Mod', 'Alt', 'Shift'];

/** Format a portable shortcut string for the current platform, or '' if none. */
export function formatShortcut(spec: string | undefined): string {
  if (!spec) return '';
  const parts = spec.split('-');
  const key = parts[parts.length - 1]!;
  let mods = parts.slice(0, -1);

  // Non-mac collision guard: only "Ctrl-Mod-…" (Full screen ⌃⌘F) hits this —
  // Mod maps to Ctrl too, so render the primary as Alt to avoid "Ctrl+Ctrl".
  if (!IS_MAC && mods.includes('Ctrl') && mods.includes('Mod')) {
    mods = mods.map((m) => (m === 'Mod' ? 'Alt' : m));
  }

  const ordered = [...mods].sort((a, b) => MOD_ORDER.indexOf(a) - MOD_ORDER.indexOf(b));
  const keyLabel = key.length === 1 ? key.toUpperCase() : key;

  if (IS_MAC) {
    return ordered.map((m) => MAC_SYMBOL[m] ?? m).join('') + keyLabel;
  }
  return [...ordered.map((m) => OTHER_WORD[m] ?? m), keyLabel].join('+');
}
