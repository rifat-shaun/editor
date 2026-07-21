/**
 * MenuBar — the WAI-ARIA menubar. Renders the row of triggers under the doc
 * title and orchestrates open state: click opens; while any menu is open,
 * hovering another trigger switches to it (Google-Docs behavior); ←/→ move
 * between menus; ↓/Enter opens the focused one; F10 focuses the bar; Escape or
 * an outside click closes and returns focus to the trigger.
 *
 * The command context (editor + UI state + host services) is built here and
 * passed to the panels; dynamic enabled/checked/badge values resolve in the
 * registry against live editor state.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useEditorState } from '../editor/context';
import { MenuPanel } from './Menu';
import { buildCommandIndex } from './helpSearch';
import { WordCountDialog } from './WordCountDialog';
import { PageSetupDialog } from './PageSetupDialog';
import type { MenuSpec } from './types';
import type { CmdCtx, CmdServices } from './registry';

const SYSTEM_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

// Clickable text (not a button chrome): no box/background — hover darkens the
// text, open turns it teal. Small padding keeps a comfortable hit area.
const triggerStyle = (open: boolean, hover: boolean): CSSProperties => ({
  fontSize: 12,
  fontFamily: SYSTEM_FONT,
  padding: '2px 2px',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  color: open ? 'var(--color-primary)' : hover ? 'var(--color-ink)' : 'var(--color-ui)',
  fontWeight: open ? 600 : 400,
});

export function MenuBar({ menus, onRename }: { menus: MenuSpec[]; onRename: () => void }) {
  const ui = useEditorState();
  const [openId, setOpenId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [wordCountOpen, setWordCountOpen] = useState(false);
  const [pageSetupOpen, setPageSetupOpen] = useState(false);
  const triggerRefs = useRef<Record<string, HTMLElement | null>>({});
  const navRef = useRef<HTMLElement>(null);
  const cmdIndex = useMemo(() => buildCommandIndex(menus), [menus]);

  const svc: CmdServices = useMemo(
    () => ({
      startRename: onRename,
      confirm: (m) => window.confirm(m),
      openWordCount: () => setWordCountOpen(true),
      openPageSetup: () => setPageSetupOpen(true),
      downloadDocx: () => {
        const editor = ui.editor;
        if (!editor) return;
        void import('../editor/export/docx')
          .then(({ downloadDocx }) => downloadDocx(editor, ui.title || 'Document', { includeHeaderFooter: true }))
          .catch((err) => console.error('DOCX export failed', err));
      },
    }),
    [ui, onRename],
  );

  const ctx: CmdCtx | null = ui.editor ? { editor: ui.editor, ui, svc } : null;

  const close = useCallback(() => {
    const id = openId;
    setOpenId(null);
    if (id) triggerRefs.current[id]?.focus();
  }, [openId]);

  // Close on outside pointerdown — but NOT on the bar (triggers toggle/switch
  // themselves) or inside any open panel. No full-screen backdrop, so hovering
  // another trigger can still switch menus.
  useEffect(() => {
    if (!openId) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (navRef.current?.contains(t) || t?.closest('[role="menu"]')) return;
      setOpenId(null);
    };
    window.addEventListener('mousedown', onDown, true);
    return () => window.removeEventListener('mousedown', onDown, true);
  }, [openId]);

  const switchBy = useCallback(
    (delta: number, andOpen: boolean) => {
      const idx = openId ? menus.findIndex((m) => m.id === openId) : menus.findIndex((m) => m.id === hoverId);
      const base = idx >= 0 ? idx : 0;
      const next = menus[(base + delta + menus.length) % menus.length]!;
      triggerRefs.current[next.id]?.focus();
      if (andOpen || openId) setOpenId(next.id);
    },
    [openId, hoverId, menus],
  );

  // F10 focuses the bar; Mod-/ opens Help and focuses its search field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F10') {
        e.preventDefault();
        triggerRefs.current[menus[0]!.id]?.focus();
      } else if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        const help = menus.find((m) => m.search);
        if (help) {
          e.preventDefault();
          setOpenId(help.id);
        }
      } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
        // Page setup — the macOS-standard ⇧⌘P (pairs with Print ⌘P). Edits page
        // geometry, so it's disabled in view mode.
        if (ui.mode === 'viewing') return;
        e.preventDefault();
        setOpenId(null);
        setPageSetupOpen(true);
      } else if (e.key === 'F2' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        // Rename — the classic F2 rename key; focuses the title editor. Editing
        // the title is disabled in view mode.
        if (ui.mode === 'viewing') return;
        e.preventDefault();
        setOpenId(null);
        onRename();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menus, onRename, ui.mode]);

  const onTriggerKey = (e: React.KeyboardEvent, id: string) => {
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        switchBy(1, false);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        switchBy(-1, false);
        break;
      case 'ArrowDown':
      case 'Enter':
      case ' ':
        e.preventDefault();
        setOpenId(id);
        break;
      case 'Escape':
        if (openId) {
          e.preventDefault();
          close();
        }
        break;
    }
  };

  const openSpec = menus.find((m) => m.id === openId);
  const anchor = openId ? triggerRefs.current[openId]?.getBoundingClientRect() : undefined;

  return (
    <>
      <nav ref={navRef} role="menubar" aria-label="Menu bar" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '0 4px' }}>
        {menus.map((m) => (
          <span
            key={m.id}
            ref={(el) => (triggerRefs.current[m.id] = el)}
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={openId === m.id}
            tabIndex={0}
            onClick={() => setOpenId((cur) => (cur === m.id ? null : m.id))}
            onMouseEnter={() => setHoverId(m.id)} // highlight only — no hover-switch
            onMouseLeave={() => setHoverId((h) => (h === m.id ? null : h))}
            onKeyDown={(e) => onTriggerKey(e, m.id)}
            style={triggerStyle(openId === m.id, hoverId === m.id)}
          >
            {m.label}
          </span>
        ))}
      </nav>

      {openSpec && anchor && ctx && (
        <>
          <MenuPanel
            key={openSpec.id}
            items={openSpec.items}
            ctx={ctx}
            anchor={anchor}
            side="bottom"
            searchIndex={openSpec.search ? cmdIndex : undefined}
            onCloseAll={close}
            onCloseSelf={close}
            onPrevMenu={() => switchBy(-1, true)}
            onNextMenu={() => switchBy(1, true)}
          />
        </>
      )}

      {wordCountOpen && (
        <WordCountDialog
          words={ui.wordCount}
          chars={ui.charCount}
          pages={ui.pageCount}
          onClose={() => setWordCountOpen(false)}
        />
      )}

      {pageSetupOpen && ctx && (
        <PageSetupDialog editor={ctx.editor} onClose={() => setPageSetupOpen(false)} />
      )}
    </>
  );
}
