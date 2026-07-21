/**
 * Help command-search — a single flat index built over the SAME MenuSpec[] data
 * (no separate command list). Indexes every leaf command with its label,
 * shortcut, and parent-menu path; the Help search field filters it and Enter
 * dispatches the command id.
 */
import type { MenuSpec, MenuNode } from './types';
import { isDivider } from './types';

export interface FlatCmd {
  id: string;
  label: string;
  /** Breadcrumb of parent menu/submenu labels, e.g. "Format ▸ Text". */
  path: string;
  shortcut?: string;
}

export function buildCommandIndex(menus: MenuSpec[]): FlatCmd[] {
  const out: FlatCmd[] = [];
  const walk = (nodes: MenuNode[], trail: string[]) => {
    for (const n of nodes) {
      if (isDivider(n)) continue;
      if (n.submenu) walk(n.submenu, [...trail, n.label]);
      else out.push({ id: n.id, label: n.label, path: trail.join(' ▸ '), shortcut: n.shortcut });
    }
  };
  for (const m of menus) walk(m.items, [m.label]);
  return out;
}

export function filterCommands(index: FlatCmd[], query: string, limit = 12): FlatCmd[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return index
    .filter((c) => c.label.toLowerCase().includes(q) || c.path.toLowerCase().includes(q))
    .slice(0, limit);
}
