import { describe, expect, it } from 'vitest';
import { buildCommandIndex, filterCommands } from '../src/menus/helpSearch';
import { MENUS } from '../src/menus/menuData';

describe('Help command-search index', () => {
  const index = buildCommandIndex(MENUS);

  it('indexes leaf commands across all menus with parent paths', () => {
    const print = index.find((c) => c.id === 'file.print');
    expect(print).toMatchObject({ label: 'Print', path: 'File', shortcut: 'Mod-P' });
  });

  it('includes submenu leaves with a breadcrumb path', () => {
    const bold = index.find((c) => c.id === 'format.bold');
    expect(bold).toMatchObject({ label: 'Bold', path: 'Format ▸ Text', shortcut: 'Mod-B' });
    const zoom100 = index.find((c) => c.id === 'view.zoom.100');
    expect(zoom100?.path).toBe('View ▸ Zoom');
  });

  it('does not index dividers or submenu parents', () => {
    expect(index.find((c) => c.label === 'Text' && c.path === 'Format')).toBeUndefined();
    expect(index.every((c) => c.label.length > 0)).toBe(true);
  });

  it('filters by label and by path, empty query → no results', () => {
    expect(filterCommands(index, '')).toEqual([]);
    const zoom = filterCommands(index, 'zoom');
    expect(zoom.length).toBeGreaterThan(0);
    expect(zoom.every((c) => c.path.includes('Zoom') || c.label.toLowerCase().includes('zoom'))).toBe(true);
    const print = filterCommands(index, 'print');
    expect(print.some((c) => c.id === 'file.print')).toBe(true);
  });

  it('caps results', () => {
    expect(filterCommands(index, 'e', 5).length).toBeLessThanOrEqual(5);
  });
});
