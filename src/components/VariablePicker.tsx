import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useEditorState } from '../editor/context';
import { useVariables } from '../editor/variablesContext';
import { resolveVariable, type VariableDef } from '../editor/extensions/variable';
import { variableSuggestKey, type VariableSuggestState } from '../editor/extensions/variableSuggest';
import { getPortalHost } from './portalHost';
import { Highlighted } from './Highlighted';

const SYSTEM_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const MAX_ROWS = 5;

const panelStyle = (pos: CSSProperties): CSSProperties => ({
  position: 'fixed',
  width: 340,
  maxWidth: 'calc(100vw - 16px)',
  background: 'var(--ui-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 9,
  boxShadow: '0 10px 32px rgba(31, 41, 51, 0.18)',
  padding: 5,
  zIndex: 75,
  fontFamily: SYSTEM_FONT,
  ...pos,
});

/** Set a native tooltip with the full text only when the element is clipped. */
function titleIfClipped(e: ReactMouseEvent<HTMLElement>, full: string) {
  const el = e.currentTarget;
  el.title = el.scrollWidth > el.clientWidth ? full : '';
}

export function VariablePicker() {
  const { editor } = useEditorState();
  const { catalog, values } = useVariables();
  const [, force] = useState(0);
  const [index, setIndex] = useState(0);
  // Track an Esc-dismissed trigger so the picker stays closed until the caret
  // moves — without deleting the literal typed text.
  const dismissed = useRef<string | null>(null);

  // Re-read the plugin state on every transaction (selection/typing).
  useEffect(() => {
    if (!editor) return;
    const bump = () => force((n) => n + 1);
    editor.on('transaction', bump);
    return () => {
      editor.off('transaction', bump);
    };
  }, [editor]);

  const sug: VariableSuggestState | null = editor ? (variableSuggestKey.getState(editor.state) ?? null) : null;
  const sig = sug ? `${sug.from}:${sug.to}:${sug.query}` : null;
  const active = !!sug && dismissed.current !== sig;

  const matches = useMemo<VariableDef[]>(() => {
    if (!sug) return [];
    const q = sug.query.toLowerCase();
    const list = q
      ? catalog.filter((d) => d.label.toLowerCase().includes(q) || d.name.toLowerCase().includes(q))
      : catalog;
    return list.slice(0, MAX_ROWS);
  }, [sug, catalog]);

  // Reset the highlighted row whenever the result set changes.
  useEffect(() => {
    setIndex(0);
  }, [sig]);

  const insert = (def: VariableDef | undefined) => {
    if (!editor || !def || !sug) return;
    editor.chain().focus().insertVariableAt({ from: sug.from, to: sug.to }, def.name).run();
  };

  // Keyboard: intercept only navigation keys while open; letters fall through
  // to the editor to extend the query. A no-match picker just closes (Esc /
  // typing a space breaks the trigger), keeping the literal text.
  useEffect(() => {
    if (!active || !editor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setIndex((i) => (matches.length ? (i + 1) % matches.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setIndex((i) => (matches.length ? (i - 1 + matches.length) % matches.length : 0));
      } else if (e.key === 'Enter') {
        if (!matches.length) return;
        e.preventDefault();
        insert(matches[index]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        dismissed.current = sig; // keep the literal text, hide until caret moves
        force((n) => n + 1);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, editor, matches, index, sig]);

  if (!editor || !active || !sug || matches.length === 0) return null;

  // Anchor under the `@`.
  let coords: { left: number; bottom: number } | null = null;
  try {
    const c = editor.view.coordsAtPos(sug.from);
    coords = { left: c.left, bottom: c.bottom };
  } catch {
    coords = null;
  }
  if (!coords) return null;
  const left = Math.max(8, Math.min(coords.left, window.innerWidth - 340 - 8));
  const top = coords.bottom + 4;

  return createPortal(
    <div data-docs-editor-root style={{ display: 'contents' }}>
      <div role="listbox" aria-label="Insert variable" style={panelStyle({ top, left })}>
        <div
          style={{
            padding: '4px 9px 6px',
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            color: 'var(--ui-faint)',
          }}
        >
          Variables
        </div>
        {matches.map((def, i) => {
          const r = resolveVariable(values, def.name);
          const isActive = i === index;
          return (
            <button
              key={def.name}
              type="button"
              role="option"
              aria-selected={isActive}
              // Prevent the mousedown from blurring the editor before we insert.
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setIndex(i)}
              onClick={() => insert(def)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                width: '100%',
                padding: '7px 9px',
                border: 'none',
                borderRadius: 6,
                textAlign: 'left',
                cursor: 'pointer',
                fontFamily: SYSTEM_FONT,
                fontSize: 12.5,
                background: isActive ? 'var(--ui-row-hover)' : 'transparent',
                color: 'var(--ui-text)',
              }}
            >
              {/* Left: label above, {{ technical_name }} on its own line below. */}
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span
                  onMouseEnter={(e) => titleIfClipped(e, def.label)}
                  style={{ fontWeight: 600, fontSize: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                >
                  <Highlighted text={def.label} query={sug.query} />
                </span>
                <span style={{ fontFamily: MONO, fontSize: 8, color: 'var(--color-primary)', whiteSpace: 'nowrap' }}>
                  {'{{'}
                  <Highlighted text={def.name} query={sug.query} />
                  {'}}'}
                </span>
              </span>
              {/* Right: current value (ellipsized) or italic "unset". */}
              <span
                onMouseEnter={(e) => !r.unset && titleIfClipped(e, r.value ?? '')}
                style={{
                  flexShrink: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: 150,
                  color: r.unset ? 'var(--ui-faint)' : 'var(--ui-text-dim)',
                  fontStyle: r.unset ? 'italic' : 'normal',
                }}
              >
                {r.unset ? 'unset' : r.value}
              </span>
            </button>
          );
        })}
        <div
          style={{
            display: 'flex',
            gap: 12,
            padding: '6px 9px 3px',
            fontSize: 10,
            color: 'var(--ui-faint)',
            borderTop: '1px solid var(--ui-hover)',
            marginTop: 3,
          }}
        >
          <span>↑↓ navigate</span>
          <span>↵ insert</span>
          <span>esc dismiss</span>
        </div>
      </div>
    </div>,
    getPortalHost(),
  );
}
