/**
 * MenuPanel — the portaled dropdown surface for one menu (or submenu) and its
 * item rows. Handles roving focus, ↑↓ navigation, Enter/Space activation,
 * typeahead, →/← submenu open/return, Escape, click-to-open submenus, and
 * viewport flip (up near the bottom, left near the right edge).
 *
 * Recursive: a submenu is another MenuPanel with `side="right"`.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { MenuNode } from './types';
import { isDivider } from './types';
import { formatShortcut } from './platform';
import { getCommand, isItemEnabled, type CmdCtx } from './registry';
import { filterCommands, type FlatCmd } from './helpSearch';

const SYSTEM_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const panelStyle = (pos: CSSProperties): CSSProperties => ({
  position: 'fixed',
  minWidth: 220,
  background: 'var(--ui-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 9,
  boxShadow: '0 10px 32px rgba(31, 41, 51, 0.18)',
  padding: 5,
  zIndex: 70,
  fontFamily: SYSTEM_FONT,
  ...pos,
});

const rowBase: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  padding: '7px 10px',
  borderRadius: 6,
  fontSize: 12.5,
  whiteSpace: 'nowrap',
  border: 'none',
  background: 'transparent',
  width: '100%',
  textAlign: 'left',
  fontFamily: SYSTEM_FONT,
};

const RIGHT = {
  shortcut: { fontSize: 10.5, color: 'var(--ui-faint)' } as CSSProperties,
  submenu: { fontSize: 10, color: 'var(--ui-faint)' } as CSSProperties,
  check: { fontSize: 12, fontWeight: 700, color: 'var(--color-primary)' } as CSSProperties,
  hint: { fontSize: 10, color: 'var(--ui-faint)' } as CSSProperties,
};

const badgeStyle = (variant: 'teal' | 'amber'): CSSProperties => ({
  fontSize: 10,
  fontWeight: 600,
  borderRadius: 8,
  padding: '1px 7px',
  color: variant === 'amber' ? 'var(--ui-amber)' : 'var(--color-primary)',
  background: variant === 'amber' ? 'var(--ui-amber-bg)' : 'var(--color-primary-soft)',
});

export interface MenuPanelProps {
  items: MenuNode[];
  ctx: CmdCtx;
  anchor: DOMRect;
  side: 'bottom' | 'right';
  /** Close the whole chain (leaf activated / Escape at root / outside click). */
  onCloseAll: () => void;
  /** Close just this (sub)panel, returning focus to the parent item. */
  onCloseSelf: () => void;
  /** Root-only: ←/→ at top level switch menus in the bar. */
  onPrevMenu?: () => void;
  onNextMenu?: () => void;
  /** Help menu: pins a search field that filters this flat command index. */
  searchIndex?: FlatCmd[];
}

/** Indices of navigable (non-divider) items. */
function focusableIndices(items: MenuNode[]): number[] {
  return items.map((n, i) => (isDivider(n) ? -1 : i)).filter((i) => i >= 0);
}

export function MenuPanel({
  items,
  ctx,
  anchor,
  side,
  onCloseAll,
  onCloseSelf,
  onPrevMenu,
  onNextMenu,
  searchIndex,
}: MenuPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [query, setQuery] = useState('');
  const typeahead = useRef<{ buf: string; at: number }>({ buf: '', at: 0 });

  // In search mode with a query, the rows become flat command results.
  const searching = !!searchIndex && query.trim().length > 0;
  const displayItems: MenuNode[] = searching
    ? filterCommands(searchIndex!, query).map((c) => ({ id: c.id, label: c.label, hint: c.path, shortcut: c.shortcut }))
    : items;

  const nav = focusableIndices(displayItems);
  // Search panels start focused in the input (active = -1); others on the first item.
  const [active, setActive] = useState<number>(searchIndex ? -1 : (nav[0] ?? 0));
  const [openSub, setOpenSub] = useState<number | null>(null);
  const [pos, setPos] = useState<CSSProperties>({ visibility: 'hidden' });
  const [ready, setReady] = useState(false); // positioned + visible → safe to focus

  // Position + flip once mounted (need the panel's measured size).
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top: number;
    let left: number;
    if (side === 'bottom') {
      top = anchor.bottom + 4;
      left = anchor.left;
      if (top + height > vh - 8) top = Math.max(8, anchor.top - height - 4); // flip up
      if (left + width > vw - 8) left = Math.max(8, vw - width - 8);
    } else {
      top = anchor.top - 5; // align to the row (panel padding)
      left = anchor.right - 4; // open right, slight overlap
      if (left + width > vw - 8) left = Math.max(8, anchor.left - width + 4); // flip left
      if (top + height > vh - 8) top = Math.max(8, vh - height - 8);
    }
    setPos({ top: Math.round(top), left: Math.round(left) });
    setReady(true);
  }, [anchor, side, items, query]);

  // Focus only once the panel is positioned + visible (visibility:hidden
  // elements can't receive focus). Search panels focus the input (active < 0).
  useEffect(() => {
    if (!ready) return;
    if (active < 0) inputRef.current?.focus();
    else rowRefs.current[active]?.focus();
  }, [active, ready]);

  const moveActive = (dir: 1 | -1) => {
    if (nav.length === 0) return;
    const cur = nav.indexOf(active);
    const next = (cur + dir + nav.length) % nav.length;
    setActive(nav[next]!);
    setOpenSub(null);
  };

  const activate = (i: number) => {
    const node = displayItems[i];
    if (!node || isDivider(node)) return;
    const item = node;
    if (item.submenu) {
      // Click toggles the submenu (open on click only — never on hover).
      setActive(i);
      setOpenSub((cur) => (cur === i ? null : i));
      return;
    }
    if (!isItemEnabled(item.id, ctx)) return;
    if (item.destructive && !ctx.svc.confirm(`${item.label}?`)) return;
    getCommand(item.id)?.run?.(ctx);
    onCloseAll();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Portal children bubble through the React tree — stop here so an open
    // submenu's keystrokes aren't also handled by this parent panel.
    e.stopPropagation();
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        moveActive(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        moveActive(-1);
        break;
      case 'Home':
        e.preventDefault();
        setActive(nav[0]!);
        break;
      case 'End':
        e.preventDefault();
        setActive(nav[nav.length - 1]!);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        activate(active);
        break;
      case 'ArrowRight': {
        const node = displayItems[active];
        if (node && !isDivider(node) && node.submenu) {
          e.preventDefault();
          setOpenSub(active);
        } else if (onNextMenu) {
          e.preventDefault();
          onNextMenu();
        }
        break;
      }
      case 'ArrowLeft':
        if (side === 'right') {
          e.preventDefault();
          onCloseSelf();
        } else if (onPrevMenu) {
          e.preventDefault();
          onPrevMenu();
        }
        break;
      case 'Escape':
        e.preventDefault();
        onCloseAll();
        break;
      default:
        // Typeahead by first letter.
        if (e.key.length === 1 && /\S/.test(e.key)) {
          const now = Date.now();
          const ta = typeahead.current;
          ta.buf = now - ta.at > 600 ? e.key : ta.buf + e.key;
          ta.at = now;
          const q = ta.buf.toLowerCase();
          const start = nav.indexOf(active);
          for (let k = 1; k <= nav.length; k++) {
            const idx = nav[(start + k) % nav.length]!;
            const node = displayItems[idx];
            if (node && !isDivider(node) && node.label.toLowerCase().startsWith(q)) {
              setActive(idx);
              break;
            }
          }
        }
    }
  };

  return createPortal(
    <div ref={panelRef} role="menu" style={panelStyle(pos)} onKeyDown={onKeyDown}>
      {searchIndex && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '2px 2px 6px', padding: '6px 9px', border: '1px solid var(--ui-border-strong)', borderRadius: 7 }}>
          <span aria-hidden="true" style={{ fontSize: 12 }}>🔍</span>
          <input
            ref={inputRef}
            type="text"
            role="searchbox"
            aria-label="Search menus"
            placeholder="Search menus…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(-1);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'ArrowDown' && nav.length) {
                e.preventDefault();
                setActive(nav[0]!);
              } else if (e.key === 'Enter' && searching && nav.length) {
                e.preventDefault();
                activate(nav[0]!);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                if (query) setQuery('');
                else onCloseAll();
              }
            }}
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, fontFamily: SYSTEM_FONT, color: 'var(--ui-text)', minWidth: 0 }}
          />
          <span aria-hidden="true" style={{ fontSize: 10.5, color: 'var(--ui-faint)' }}>{formatShortcut('Mod-/')}</span>
        </div>
      )}
      {searching && nav.length === 0 && (
        <div style={{ ...rowBase, color: 'var(--ui-faint)', cursor: 'default' }}>No matching commands</div>
      )}
      {displayItems.map((node, i) => {
        if (isDivider(node)) {
          return <div key={`d${i}`} role="separator" style={{ height: 1, background: 'var(--ui-hover)', margin: '4px 6px' }} />;
        }
        const item = node;
        const cmd = getCommand(item.id);
        // Submenu parents are always interactive (they open the submenu),
        // regardless of whether their id has a command.
        const interactive = Boolean(item.submenu) || isItemEnabled(item.id, ctx);
        const checked = item.role ? Boolean(cmd?.isChecked?.(ctx)) : undefined;
        const badge = cmd?.badge?.(ctx) ?? null;
        const role = item.role === 'checkbox' ? 'menuitemcheckbox' : item.role === 'radio' ? 'menuitemradio' : 'menuitem';
        const isActive = active === i;

        const color = !interactive
          ? 'var(--ui-disabled)'
          : item.destructive
            ? 'var(--ui-danger)'
            : item.ai
              ? 'var(--color-primary)'
              : 'var(--ui-text)';
        const hoverBg = item.destructive ? 'var(--ui-danger-bg)' : 'var(--ui-row-hover)';

        return (
          <div key={item.id} style={{ position: 'relative' }}>
            <button
              ref={(el) => (rowRefs.current[i] = el)}
              type="button"
              role={role}
              tabIndex={isActive ? 0 : -1}
              aria-disabled={!interactive || undefined}
              aria-haspopup={item.submenu ? 'menu' : undefined}
              aria-expanded={item.submenu ? openSub === i : undefined}
              aria-checked={item.role ? checked : undefined}
              onMouseEnter={() => {
                // Hover only highlights; it never opens a submenu (click/→ do
                // that). Moving to a different row closes any open flyout.
                setActive(i);
                setOpenSub((cur) => (cur === i ? cur : null));
              }}
              onFocus={() => setActive(i)}
              onClick={() => activate(i)}
              style={{
                ...rowBase,
                color,
                fontWeight: item.ai ? 600 : 400,
                cursor: interactive ? 'pointer' : 'default',
                background: isActive && interactive ? hoverBg : 'transparent',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                {item.role && (
                  <span aria-hidden="true" style={{ width: 12, ...RIGHT.check, opacity: checked ? 1 : 0 }}>
                    ✓
                  </span>
                )}
                {item.glyph && <span aria-hidden="true" style={{ color: 'var(--ui-faint)' }}>{item.glyph}</span>}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.ai ? `✦ ${item.label}` : item.label}
                </span>
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                {badge && <span style={badgeStyle(badge.variant ?? 'teal')}>{badge.text}</span>}
                {item.hint && <span style={RIGHT.hint}>{item.hint}</span>}
                {item.shortcut && <span style={RIGHT.shortcut}>{formatShortcut(item.shortcut)}</span>}
                {item.submenu && <span aria-hidden="true" style={RIGHT.submenu}>▸</span>}
              </span>
            </button>

            {openSub === i && item.submenu && rowRefs.current[i] && (
              <MenuPanel
                items={item.submenu}
                ctx={ctx}
                anchor={rowRefs.current[i]!.getBoundingClientRect()}
                side="right"
                onCloseAll={onCloseAll}
                onCloseSelf={() => {
                  setOpenSub(null);
                  rowRefs.current[i]?.focus();
                }}
              />
            )}
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
