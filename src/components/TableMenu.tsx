import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CellSelection } from '@tiptap/pm/tables';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { Editor } from '@tiptap/core';
import { useEditorState } from '../editor/context';
import { headerColumnCount, headerRowCount } from '../editor/extensions/tableReorder';

/**
 * Table context menu — a vertical dropdown opened by RIGHT-CLICK inside a table.
 * Presentation only: every action maps 1:1 to the existing table commands.
 * Full keyboard nav (arrows / Home / End / typeahead), focus-trapped, ARIA menu.
 */

// Shortcut glyphs — Mac symbols vs. Ctrl/Alt/Shift text on other platforms.
const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iP(hone|ad|od)/.test(navigator.platform || navigator.userAgent);
const MOD = IS_MAC ? '⌘' : 'Ctrl';
const ALT = IS_MAC ? '⌥' : 'Alt';
const SHIFT = IS_MAC ? '⇧' : 'Shift';
const BKSP = IS_MAC ? '⌫' : 'Backspace';
const sc = (...parts: string[]) => parts.join(IS_MAC ? '' : '+');

const FILL_COLORS = ['#fbe4e4', '#ddf2e6', '#d8eef5', '#fdf3d0', '#eceff2'];

/** Innermost table node enclosing the current selection. */
function currentTable(editor: Editor): PMNode | null {
  const { $from } = editor.state.selection;
  for (let d = $from.depth; d > 0; d--) {
    const n = $from.node(d);
    if (n.type.spec.tableRole === 'table') return n;
  }
  return null;
}

/* ------------------------- menu building blocks (module scope) ------------------------- */

function MenuItem({
  icon,
  label,
  shortcut,
  onSelect,
  disabled,
  destructive,
}: {
  icon: string;
  label: string;
  shortcut?: string;
  onSelect: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      data-mi
      data-label={label}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onSelect}
      className={`pgn-tm-item${destructive ? ' is-destructive' : ''}`}
    >
      <span className="pgn-tm-label">
        <span className="pgn-tm-ico" aria-hidden="true">
          {icon}
        </span>
        {label}
      </span>
      {shortcut && <span className="pgn-tm-sc">{shortcut}</span>}
    </button>
  );
}

function ToggleItem({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={on}
      data-mi
      data-label={label}
      onClick={onToggle}
      className="pgn-tm-item"
    >
      <span className="pgn-tm-label">{label}</span>
      <span className={`pgn-tm-switch${on ? ' is-on' : ''}`} aria-hidden="true">
        <span className="pgn-tm-knob" />
      </span>
    </button>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="pgn-tm-section" role="group" aria-label={label}>
      <div className="pgn-tm-group">{label}</div>
      {children}
    </div>
  );
}

export function TableMenu() {
  const { editor, ai } = useEditorState();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const [, force] = useState(0);

  // Re-render on selection change (keeps can()/toggles/fill live) and close if
  // the selection leaves the table.
  useEffect(() => {
    if (!editor) return;
    const bump = () => {
      force((n) => n + 1);
      if (!editor.isActive('table')) setOpen(false);
    };
    editor.on('selectionUpdate', bump);
    editor.on('transaction', bump);
    return () => {
      editor.off('selectionUpdate', bump);
      editor.off('transaction', bump);
    };
  }, [editor]);

  // Right-click inside a table opens the menu at the pointer.
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom as HTMLElement;
    let selAtDown: import('@tiptap/pm/state').Selection | null = null;
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 2) selAtDown = editor.state.selection;
    };
    const onContextMenu = (e: MouseEvent) => {
      if (!editor.isEditable) return;
      const found = editor.view.posAtCoords({ left: e.clientX, top: e.clientY });
      if (!found) return;
      const $pos = editor.state.doc.resolve(found.inside >= 0 ? found.inside : found.pos);
      let inTable = false;
      for (let d = $pos.depth; d > 0; d--) {
        if ($pos.node(d).type.spec.tableRole === 'table') {
          inTable = true;
          break;
        }
      }
      if (!inTable) return; // outside a table → native menu
      e.preventDefault();
      setPos({ x: e.clientX, y: e.clientY });
      setOpen(true);
      // Set the target selection AFTER the right-click's own mouseup (PM
      // collapses on both mousedown/up); preserve a multi-cell CellSelection.
      const prev = selAtDown;
      const targetPos = found.pos;
      setTimeout(() => {
        if (!editor.isEditable) return;
        if (prev instanceof CellSelection) editor.view.dispatch(editor.state.tr.setSelection(prev));
        else editor.commands.setTextSelection(targetPos);
      }, 0);
    };
    dom.addEventListener('mousedown', onMouseDown, true);
    dom.addEventListener('contextmenu', onContextMenu);
    return () => {
      dom.removeEventListener('mousedown', onMouseDown, true);
      dom.removeEventListener('contextmenu', onContextMenu);
    };
  }, [editor]);

  // Dismiss on outside pointerdown / Escape / scroll.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onScroll = () => setOpen(false);
    const t = window.setTimeout(() => {
      document.addEventListener('pointerdown', onDown, true);
      document.addEventListener('keydown', onKey, true);
      window.addEventListener('scroll', onScroll, true);
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  // Clamp into viewport + focus the first item when opened.
  useLayoutEffect(() => {
    if (!open || !menuRef.current) return;
    const r = menuRef.current.getBoundingClientRect();
    const x = Math.min(pos.x, Math.max(8, window.innerWidth - r.width - 8));
    const y = Math.min(pos.y, Math.max(8, window.innerHeight - r.height - 8));
    if (x !== pos.x || y !== pos.y) setPos({ x, y });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLElement>('[data-mi]:not(:disabled)')?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  if (!editor || !open || ai.phase === 'generating') return null;

  const can = editor.can();
  const table = currentTable(editor);
  const headerRowOn = table ? headerRowCount(table) > 0 : false;
  const headerColOn = table ? headerColumnCount(table) > 0 : false;
  const currentFill =
    (editor.getAttributes('tableCell').backgroundColor as string | null | undefined) ??
    (editor.getAttributes('tableHeader').backgroundColor as string | null | undefined) ??
    null;

  // Action items close the menu (and refocus the editor); toggles/swatches stay
  // open and don't move focus out of the menu (so keyboard nav continues).
  const act = (fn: () => void) => () => {
    fn();
    setOpen(false);
  };

  const setFill = (color: string | null) => editor.commands.setCellAttribute('backgroundColor', color);

  /* Roving keyboard navigation over [data-mi] items (focus-trapped). */
  const onKeyDown = (e: React.KeyboardEvent) => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[data-mi]') ?? [],
    ).filter((el) => !(el as HTMLButtonElement).disabled);
    if (!items.length) return;
    const cur = items.indexOf(document.activeElement as HTMLElement);
    const focusAt = (i: number) => items[((i % items.length) + items.length) % items.length]?.focus();

    if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
      e.preventDefault();
      focusAt(cur + 1);
    } else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
      e.preventDefault();
      focusAt(cur - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      items[items.length - 1]?.focus();
    } else if (e.key.length === 1 && e.key !== ' ' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      // Typeahead by first letter.
      const ch = e.key.toLowerCase();
      for (let n = 1; n <= items.length; n++) {
        const it = items[(cur + n) % items.length]!;
        if ((it.getAttribute('data-label') || '').toLowerCase().startsWith(ch)) {
          it.focus();
          break;
        }
      }
    }
    // Enter/Space fall through to the button's native activation.
  };

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label="Table actions"
      onKeyDown={onKeyDown}
      style={{ position: 'fixed', top: pos.y, left: pos.x, zIndex: 60 }}
      className="pgn-tm"
    >
      <Section label="Row">
        <MenuItem icon="＋" label="Insert above" shortcut={sc(ALT, SHIFT, '↑')} onSelect={act(() => editor.chain().focus().addRowBefore().run())} />
        <MenuItem icon="＋" label="Insert below" shortcut={sc(ALT, SHIFT, '↓')} onSelect={act(() => editor.chain().focus().addRowAfter().run())} />
        <MenuItem icon="⧉" label="Duplicate row" shortcut={sc(MOD, 'D')} onSelect={act(() => editor.chain().focus().duplicateRow().run())} />
        <MenuItem icon="−" label="Delete row" shortcut={sc(ALT, BKSP)} destructive onSelect={act(() => editor.chain().focus().deleteRow().run())} />
      </Section>

      <Section label="Column">
        <MenuItem icon="＋" label="Insert left" shortcut={sc(ALT, SHIFT, '←')} onSelect={act(() => editor.chain().focus().addColumnBefore().run())} />
        <MenuItem icon="＋" label="Insert right" shortcut={sc(ALT, SHIFT, '→')} onSelect={act(() => editor.chain().focus().addColumnAfter().run())} />
        <MenuItem icon="⧉" label="Duplicate column" shortcut={sc(MOD, SHIFT, 'D')} onSelect={act(() => editor.chain().focus().duplicateColumn().run())} />
        <MenuItem icon="−" label="Delete column" shortcut={sc(ALT, SHIFT, BKSP)} destructive onSelect={act(() => editor.chain().focus().deleteColumn().run())} />
      </Section>

      <Section label="Cell">
        <MenuItem icon="⊞" label="Merge cells" shortcut={sc(MOD, 'M')} disabled={!can.mergeCells()} onSelect={act(() => editor.chain().focus().mergeCells().run())} />
        <MenuItem icon="⊟" label="Split cell" shortcut={sc(MOD, SHIFT, 'M')} disabled={!can.splitCell()} onSelect={act(() => editor.chain().focus().splitCell().run())} />
        <ToggleItem label="Header row" on={headerRowOn} onToggle={() => editor.commands.toggleHeaderRow()} />
        <ToggleItem label="Header column" on={headerColOn} onToggle={() => editor.commands.toggleHeaderColumn()} />
        <div className="pgn-tm-fill">
          <span>Fill</span>
          {FILL_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="menuitemradio"
              aria-checked={currentFill === c}
              aria-label={`Fill ${c}`}
              data-mi
              data-label={`fill ${c}`}
              onClick={() => setFill(c)}
              style={{ background: c }}
              className={`pgn-tm-swatch${currentFill === c ? ' is-selected' : ''}`}
            />
          ))}
          <button
            type="button"
            role="menuitemradio"
            aria-checked={!currentFill}
            aria-label="No fill"
            data-mi
            data-label="no fill"
            onClick={() => setFill(null)}
            className={`pgn-tm-swatch pgn-tm-nofill${!currentFill ? ' is-selected' : ''}`}
          >
            ⊘
          </button>
        </div>
      </Section>

      <div className="pgn-tm-footer">
        <MenuItem icon="✕" label="Delete table" destructive disabled={!can.deleteTable()} onSelect={act(() => editor.chain().focus().deleteTable().run())} />
      </div>
    </div>,
    document.body,
  );
}
