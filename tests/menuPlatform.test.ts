import { describe, expect, it } from 'vitest';
import { formatShortcut, IS_MAC } from '../src/menus/platform';

// jsdom reports a non-Mac platform, so these assert the Ctrl/word rendering.
describe('formatShortcut (non-mac / jsdom)', () => {
  it('is running as non-mac in jsdom', () => {
    expect(IS_MAC).toBe(false);
  });
  it('maps Mod → Ctrl and joins with +', () => {
    expect(formatShortcut('Mod-N')).toBe('Ctrl+N');
    expect(formatShortcut('Mod-P')).toBe('Ctrl+P');
  });
  it('renders multi-modifier combos in canonical order', () => {
    expect(formatShortcut('Mod-Shift-Z')).toBe('Ctrl+Shift+Z');
    expect(formatShortcut('Mod-Shift-V')).toBe('Ctrl+Shift+V');
  });
  it('resolves the Ctrl-Mod collision (Full screen) to Ctrl+Alt', () => {
    expect(formatShortcut('Ctrl-Mod-F')).toBe('Ctrl+Alt+F');
  });
  it('keeps multi-char keys and slash literally', () => {
    expect(formatShortcut('Mod-/')).toBe('Ctrl+/');
    expect(formatShortcut(undefined)).toBe('');
  });
});
