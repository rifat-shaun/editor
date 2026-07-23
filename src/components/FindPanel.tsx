import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useEditorState } from '../editor/context';
import { getFindState } from '../editor/find/findPlugin';
import type { FindMatch } from '../editor/find/findMatches';
import { Icon } from './icons';
import { TextField } from './TextField';

const DEBOUNCE_MS = 180;

const LABEL: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 600,
  color: 'var(--ui-faint)',
  textTransform: 'uppercase',
  letterSpacing: '.05em',
};

/**
 * Sidebar Find & Replace (mockup 29). Lives in the ToolRail's "Find & replace"
 * panel. Drives the FindReplace plugin (setFind / replace commands) and renders
 * the live match count, results list, and navigation. Highlights are view-only
 * decorations owned by the plugin; this component is pure UI + dispatch.
 */
export function FindPanel({ onClose }: { onClose: () => void }) {
  const { editor, mode } = useEditorState();
  const viewing = mode === 'viewing';
  const [query, setQuery] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [, force] = useState(0);
  const findRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Re-read plugin state on every transaction (doc edits, our own metas).
  useEffect(() => {
    if (!editor) return;
    const bump = () => force((n) => n + 1);
    editor.on('transaction', bump);
    return () => {
      editor.off('transaction', bump);
    };
  }, [editor]);

  // Fill the query from the current selection (single-line, non-empty).
  const prefillFromSelection = useCallback(() => {
    if (!editor) return;
    const { from, to, empty } = editor.state.selection;
    if (empty) return;
    const sel = editor.state.doc.textBetween(from, to, ' ').trim();
    if (sel && !sel.includes('\n')) setQuery(sel);
  }, [editor]);

  // On open: prefill from the selection + focus. On close (unmount): clear the
  // highlights AND collapse the selection — so reopening starts empty (the query
  // is truly cleared) rather than re-prefilling the same lingering selection.
  useEffect(() => {
    if (!editor) return;
    prefillFromSelection();
    findRef.current?.focus();
    findRef.current?.select();
    return () => {
      editor.commands.clearFind();
      const { from, empty } = editor.state.selection;
      if (!empty) editor.commands.setTextSelection(from);
    };
  }, [editor, prefillFromSelection]);

  // ⌘F while the panel is already open re-prefills from the new selection.
  useEffect(() => {
    const onOpen = () => {
      prefillFromSelection();
      findRef.current?.focus();
      findRef.current?.select();
    };
    document.addEventListener('docs:open-find', onOpen);
    return () => document.removeEventListener('docs:open-find', onOpen);
  }, [prefillFromSelection]);

  // Debounced live search on query / option changes; resets to the first match.
  useEffect(() => {
    if (!editor) return;
    const t = setTimeout(() => editor.commands.setFind({ query, matchCase, wholeWord, index: 0 }), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [editor, query, matchCase, wholeWord]);

  // Keep the current result row visible in the list.
  useEffect(() => {
    resultsRef.current?.querySelector('[data-current="true"]')?.scrollIntoView({ block: 'nearest' });
  });

  if (!editor) return null;
  const fs = getFindState(editor);
  const total = fs.matches.length;
  const current = total ? fs.matches[fs.index] : undefined;

  const scrollToMatch = (m: FindMatch) => {
    const scroller = editor.view.dom.closest('[data-docs-scroll]') as HTMLElement | null;
    if (!scroller) return;
    try {
      const coords = editor.view.coordsAtPos(m.from);
      const top = coords.top - scroller.getBoundingClientRect().top + scroller.scrollTop - 120;
      scroller.scrollTo({ top, behavior: 'smooth' });
    } catch {
      /* position not laid out */
    }
  };

  const go = (delta: 1 | -1) => {
    if (!total) return;
    const next = (fs.index + delta + total) % total;
    editor.commands.setFind({ index: next });
    scrollToMatch(fs.matches[next]!);
  };

  const jumpTo = (i: number) => {
    editor.commands.setFind({ index: i });
    scrollToMatch(fs.matches[i]!);
  };

  const clearQuery = () => {
    setQuery('');
    editor.commands.clearFind();
    // Collapse any selection so reopening the panel doesn't re-prefill it.
    const { from, empty } = editor.state.selection;
    if (!empty) editor.commands.setTextSelection(from);
    findRef.current?.focus();
  };

  const replaceCurrent = () => {
    if (editor.commands.replaceFindCurrent(replaceText)) {
      const after = getFindState(editor);
      if (after.matches[after.index]) scrollToMatch(after.matches[after.index]!);
    }
  };

  const onFindKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      go(e.shiftKey ? -1 : 1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const toggleStyle = (on: boolean): CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 28,
    minWidth: 32,
    padding: '0 6px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    border: on ? '1px solid var(--color-primary)' : '1px solid var(--ui-border-strong)',
    background: on ? 'var(--ui-selected)' : 'transparent',
    color: on ? 'var(--color-primary)' : 'var(--ui-text)',
  });

  const navBtn: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 28,
    width: 28,
    borderRadius: 6,
    border: 'none',
    background: 'transparent',
    cursor: total ? 'pointer' : 'not-allowed',
    color: total ? 'var(--ui-text)' : 'var(--ui-disabled)',
  };

  const footerBtn = (enabled: boolean): CSSProperties => ({
    flex: 1,
    padding: '8px 0',
    borderRadius: 7,
    border: '1px solid var(--ui-border-strong)',
    background: 'transparent',
    fontSize: 12,
    fontWeight: 600,
    color: enabled ? 'var(--ui-text)' : 'var(--ui-disabled)',
    cursor: enabled ? 'pointer' : 'not-allowed',
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col" style={{ color: 'var(--ui-text)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px' }}>
        {/* Find field + X-of-N count + clear */}
        <div style={{ position: 'relative' }}>
          <TextField
            ref={findRef}
            aria-label="Find"
            placeholder="Find…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onFindKeyDown}
            style={{ paddingRight: 72 }}
          />
          {query && (
            <div
              style={{
                position: 'absolute',
                right: 6,
                top: '50%',
                transform: 'translateY(-50%)',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <span style={{ fontSize: 11, color: 'var(--ui-faint)' }}>
                {total ? `${fs.index + 1} of ${total}` : 'No results'}
              </span>
              <button
                type="button"
                aria-label="Clear search"
                title="Clear search"
                onClick={clearQuery}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: 20,
                  width: 20,
                  border: 'none',
                  borderRadius: 4,
                  background: 'transparent',
                  color: 'var(--ui-faint)',
                  cursor: 'pointer',
                }}
              >
                <Icon.x size={13} />
              </button>
            </div>
          )}
        </div>

        {/* Replace field */}
        <TextField
          aria-label="Replace with"
          placeholder="Replace with…"
          value={replaceText}
          onChange={(e) => setReplaceText(e.target.value)}
        />

        {/* Options + navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button type="button" aria-pressed={matchCase} title="Match case" onClick={() => setMatchCase((v) => !v)} style={toggleStyle(matchCase)}>
            Aa
          </button>
          <button type="button" aria-pressed={wholeWord} title="Whole word" onClick={() => setWholeWord((v) => !v)} style={toggleStyle(wholeWord)}>
            <span style={{ borderBottom: '1.5px solid currentColor', lineHeight: 1, paddingBottom: 1 }}>ab</span>
          </button>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
            <button type="button" title="Previous (⇧⏎)" aria-label="Previous match" disabled={!total} onClick={() => go(-1)} style={navBtn}>
              <span style={{ display: 'inline-flex', transform: 'rotate(180deg)' }}>
                <Icon.chevronDown size={15} />
              </span>
            </button>
            <button type="button" title="Next (⏎)" aria-label="Next match" disabled={!total} onClick={() => go(1)} style={navBtn}>
              <Icon.chevronDown size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      <div style={{ ...LABEL, padding: '2px 14px 6px' }}>{total} result{total === 1 ? '' : 's'}</div>
      <div ref={resultsRef} className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 docs-scroll">
        {query && total === 0 && <p className="px-2 py-2 text-[12px] text-muted">No results</p>}
        {fs.matches.map((m, i) => {
          const on = i === fs.index;
          return (
            <button
              key={`${m.from}-${i}`}
              type="button"
              data-current={on}
              onClick={() => jumpTo(i)}
              className={[
                'block w-full truncate rounded-md px-2 py-1.5 text-left text-[12px]',
                on ? 'bg-primary-soft' : 'hover:bg-[var(--ui-hover)]',
              ].join(' ')}
              title={`${m.before}${m.text}${m.after}`}
            >
              <span className="text-[var(--ui-text-dim)]">{m.before}</span>
              {/* Fixed dark text so it stays readable on the yellow highlight in
                  both light and dark mode (the panel text color is theme-driven). */}
              <mark style={{ background: '#ffe58a', color: '#1f2430', borderRadius: 2, padding: '0 1px' }}>
                {m.text}
              </mark>
              <span className="text-[var(--ui-text-dim)]">{m.after}</span>
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderTop: '1px solid var(--ui-divider)', background: 'var(--color-chrome)' }}>
        <button type="button" disabled={viewing || !current?.replaceable} onClick={replaceCurrent} style={footerBtn(!viewing && !!current?.replaceable)}>
          Replace
        </button>
        <button type="button" disabled={viewing || !total} onClick={() => editor.commands.replaceFindAll(replaceText)} style={footerBtn(!viewing && !!total)}>
          Replace all
        </button>
      </div>
    </div>
  );
}
