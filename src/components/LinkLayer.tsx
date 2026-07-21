/**
 * The complete custom link UI — replaces Tiptap's native prompt entirely.
 *
 *  - Insert popover (21a): Text + Link fields, applied over the selection.
 *  - Edit popover (21c): pre-filled, with Remove + Update.
 *  - Hover card (21b): shown on link hover / caret-in, with open / edit / copy /
 *    remove actions.
 *
 * Entry points (⌘K, toolbar, Insert → Link) all dispatch a `docs:open-link` DOM
 * event on the editor view; this component owns the rest. Selection is
 * preserved via the `linkTarget` teal-tint decoration (see extensions/link) plus
 * the SelectionHighlight extension; Apply/Update/Remove are each one undo step.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/core';
import { useEditorState } from '../editor/context';
import { Icon } from './icons';
import { TextField } from './TextField';
import { linkAt, setLinkTarget, normalizeUrl } from '../editor/extensions/link';

type Mode = 'insert' | 'edit';
interface Range {
  from: number;
  to: number;
}
interface PopoverState extends Range {
  mode: Mode;
  originalText: string;
  text: string;
  href: string;
}
interface CardState extends Range {
  href: string;
  el: HTMLElement;
}
interface Box {
  top: number;
  left: number;
  width: number;
}

const POPOVER_W = 320;
const GAP = 8;

/** Viewport rect spanning a doc range (falls back to a caret rect). */
function rangeRect(editor: Editor, from: number, to: number): Box | null {
  try {
    const a = editor.view.coordsAtPos(from);
    const b = editor.view.coordsAtPos(Math.max(from, to));
    const left = Math.min(a.left, b.left);
    return { top: Math.max(a.bottom, b.bottom), left, width: Math.max(0, Math.max(a.right, b.right) - left) };
  } catch {
    return null;
  }
}

export function LinkLayer() {
  const { editor, mode } = useEditorState();
  const viewing = mode === 'viewing';
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const [card, setCard] = useState<CardState | null>(null);
  const [pos, setPos] = useState<Box | null>(null);
  const [cardPos, setCardPos] = useState<Box | null>(null);
  const [copied, setCopied] = useState(false);

  const popRef = useRef<HTMLDivElement | null>(null);
  const linkInputRef = useRef<HTMLInputElement | null>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overCard = useRef(false);
  const popoverRef = useRef<PopoverState | null>(null);
  popoverRef.current = popover;

  const type = editor?.schema.marks.link ?? null;

  const closePopover = useCallback(() => {
    if (editor) setLinkTarget(editor.view, null);
    setPopover(null);
    setPos(null);
    editor?.commands.focus();
  }, [editor]);

  /* --------------------------- open popover --------------------------- */

  const openEditFor = useCallback(
    (range: Range, href: string) => {
      if (!editor) return;
      const text = editor.state.doc.textBetween(range.from, range.to, ' ');
      setCard(null);
      setLinkTarget(editor.view, range);
      setPopover({ mode: 'edit', from: range.from, to: range.to, originalText: text, text, href });
    },
    [editor],
  );

  const openFromSelection = useCallback(() => {
    if (!editor || !editor.isEditable) return; // view mode: no insert/edit popover
    const { state } = editor;
    const { from, to, empty } = state.selection;
    const info = linkAt(state, from);
    // Caret/selection inside an existing link → Edit; otherwise → Insert.
    if (info && from >= info.from && to <= info.to) {
      openEditFor({ from: info.from, to: info.to }, info.href);
      return;
    }
    const text = empty ? '' : state.doc.textBetween(from, to, ' ');
    setCard(null);
    setLinkTarget(editor.view, { from, to });
    setPopover({ mode: 'insert', from, to, originalText: text, text, href: '' });
  }, [editor, openEditFor]);

  // Entry points dispatch `docs:open-link` on the view DOM.
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const onOpen = () => openFromSelection();
    dom.addEventListener('docs:open-link', onOpen as EventListener);
    return () => dom.removeEventListener('docs:open-link', onOpen as EventListener);
  }, [editor, openFromSelection]);

  /* --------------------------- apply / remove --------------------------- */

  const applyLink = useCallback(() => {
    const p = popoverRef.current;
    if (!editor || !type || !p) return;
    const href = normalizeUrl(p.href);
    if (!href) return;
    const { from, to, originalText, text } = p;
    const label = text.trim();
    editor
      .chain()
      .focus()
      .command(({ tr, dispatch }) => {
        if (!dispatch) return true;
        const mark = type.create({ href });
        const sameText = to > from && label === originalText;
        if (sameText) {
          // Preserve inline formatting: just (re)apply the link mark over the range.
          tr.removeMark(from, to, type);
          tr.addMark(from, to, mark);
        } else {
          const visible = label || href;
          tr.replaceRangeWith(from, to, editor.schema.text(visible, [mark]));
        }
        return true;
      })
      .run();
    closePopover();
  }, [editor, type, closePopover]);

  const removeRange = useCallback(
    (from: number, to: number) => {
      if (!editor || !type) return;
      editor
        .chain()
        .focus()
        .command(({ tr, dispatch }) => {
          if (dispatch) tr.removeMark(from, to, type);
          return true;
        })
        .run();
    },
    [editor, type],
  );

  const removeFromPopover = useCallback(() => {
    const p = popoverRef.current;
    if (!p) return;
    removeRange(p.from, p.to);
    closePopover();
  }, [removeRange, closePopover]);

  /* --------------------------- positioning --------------------------- */

  const reposition = useCallback(() => {
    if (!editor) return;
    const p = popoverRef.current;
    if (!p) return;
    const r = rangeRect(editor, p.from, p.to);
    if (!r) return;
    const h = popRef.current?.offsetHeight ?? 160;
    let top = r.top + GAP;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - GAP - h - 4); // flip above
    const left = Math.min(Math.max(8, r.left), window.innerWidth - POPOVER_W - 8);
    setPos({ top, left, width: POPOVER_W });
  }, [editor]);

  useLayoutEffect(() => {
    if (popover) reposition();
  }, [popover, reposition]);

  useEffect(() => {
    if (!popover) return;
    const onMove = () => reposition();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [popover, reposition]);

  // Autofocus the Link field on open.
  useEffect(() => {
    if (popover) requestAnimationFrame(() => linkInputRef.current?.focus());
  }, [popover]);

  // Esc + outside-click dismiss (without applying); focus trap on Tab.
  useEffect(() => {
    if (!popover) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closePopover();
      } else if (e.key === 'Tab' && popRef.current) {
        const focusables = popRef.current.querySelectorAll<HTMLElement>(
          'input,button,[tabindex]:not([tabindex="-1"])',
        );
        if (!focusables.length) return;
        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    const onDown = (e: PointerEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) closePopover();
    };
    window.addEventListener('keydown', onKey, true);
    // Defer so the opening click doesn't immediately close it.
    const id = setTimeout(() => document.addEventListener('pointerdown', onDown, true), 0);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      clearTimeout(id);
      document.removeEventListener('pointerdown', onDown, true);
    };
  }, [popover, closePopover]);

  /* ----------------------------- hover card ----------------------------- */

  const clearTimers = () => {
    if (showTimer.current) clearTimeout(showTimer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
  };

  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!overCard.current) setCard(null);
    }, 200);
  }, []);

  const showCardForEl = useCallback(
    (el: HTMLElement, immediate = false) => {
      if (!editor || popoverRef.current) return;
      const run = () => {
        try {
          const pos0 = editor.view.posAtDOM(el, 0);
          const info = linkAt(editor.state, pos0);
          if (info) setCard({ from: info.from, to: info.to, href: info.href, el });
        } catch {
          /* element detached */
        }
      };
      if (showTimer.current) clearTimeout(showTimer.current);
      if (immediate) run();
      else showTimer.current = setTimeout(run, 300);
    },
    [editor],
  );

  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const onOver = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('a');
      if (a && dom.contains(a)) showCardForEl(a);
    };
    const onOut = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('a');
      if (a) {
        if (showTimer.current) clearTimeout(showTimer.current);
        scheduleHide();
      }
    };
    // Caret moved into a link → show immediately (unless the popover is open).
    const onSel = () => {
      if (popoverRef.current) return;
      const { from, empty } = editor.state.selection;
      if (!empty) return;
      const info = linkAt(editor.state, from);
      if (!info) {
        if (!overCard.current) scheduleHide();
        return;
      }
      const el = editor.view.nodeDOM(info.from) as HTMLElement | null;
      const anchor = el?.closest?.('a') ?? (editor.view.domAtPos(info.from + 1).node.parentElement as HTMLElement | null);
      if (anchor && anchor.tagName === 'A') showCardForEl(anchor, true);
    };
    dom.addEventListener('mouseover', onOver);
    dom.addEventListener('mouseout', onOut);
    editor.on('selectionUpdate', onSel);
    return () => {
      dom.removeEventListener('mouseover', onOver);
      dom.removeEventListener('mouseout', onOut);
      editor.off('selectionUpdate', onSel);
      clearTimers();
    };
  }, [editor, showCardForEl, scheduleHide]);

  // Position the hover card under its link; track scroll/resize.
  const repositionCard = useCallback(() => {
    const c = card;
    if (!c) return;
    const r = c.el.getBoundingClientRect();
    setCardPos({ top: r.bottom + GAP, left: r.left, width: 0 });
  }, [card]);

  useLayoutEffect(() => {
    if (card) repositionCard();
    else setCardPos(null);
  }, [card, repositionCard]);

  useEffect(() => {
    if (!card) return;
    const onMove = () => repositionCard();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [card, repositionCard]);

  const copyUrl = useCallback(() => {
    if (!card) return;
    void navigator.clipboard?.writeText(card.href).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }, [card]);

  if (!editor) return null;

  const valid = popover ? normalizeUrl(popover.href) !== null : false;

  return (
    <>
      {/* Rendered as function calls (not <Component/>) so the inputs keep their
          identity + focus across re-renders instead of remounting per keystroke. */}
      {popover && pos && createPortal(renderPopover(), document.body)}
      {card && cardPos && !popover && createPortal(renderHoverCard(), document.body)}
    </>
  );

  /* ----------------------------- render helpers ----------------------------- */

  function renderPopover() {
    const p = popover!;
    const isEdit = p.mode === 'edit';
    return (
      <div
        ref={popRef}
        role="dialog"
        aria-label={isEdit ? 'Edit link' : 'Insert link'}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: pos!.top,
          left: pos!.left,
          width: POPOVER_W,
          zIndex: 80,
          display: 'flex',
          flexDirection: 'column',
          gap: 9,
          padding: 12,
          background: 'var(--ui-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 10,
          boxShadow: '0 12px 36px rgba(31,41,51,.2)',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        }}
      >
        {isEdit && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink)' }}>Edit link</span>
            <button
              type="button"
              aria-label="Close"
              onClick={closePopover}
              style={iconBtn(22, 'var(--color-muted)')}
            >
              <Icon.x size={13} />
            </button>
          </div>
        )}

        <Field label="Text">
          <TextField
            value={p.text}
            onChange={(e) => setPopover({ ...p, text: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                applyLink();
              }
            }}
            aria-label="Link text"
          />
        </Field>

        <Field label="Link">
          <TextField
            ref={linkInputRef}
            value={p.href}
            placeholder="Paste a URL, or search this document"
            icon={<Icon.link size={14} style={{ color: 'var(--color-primary)' }} />}
            suffix={
              isEdit && p.href ? (
                <button
                  type="button"
                  aria-label="Clear link"
                  onClick={() => {
                    setPopover({ ...p, href: '' });
                    linkInputRef.current?.focus();
                  }}
                  style={iconBtn(18, 'var(--color-muted)', 4)}
                >
                  <Icon.x size={11} />
                </button>
              ) : undefined
            }
            onChange={(e) => setPopover({ ...p, href: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && valid) {
                e.preventDefault();
                applyLink();
              }
            }}
            aria-label="Link URL"
          />
        </Field>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 1 }}>
          {isEdit ? (
            <button
              type="button"
              onClick={removeFromPopover}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--ui-danger)',
                background: 'transparent',
                border: 'none',
                borderRadius: 5,
                padding: '4px 7px',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--ui-danger-bg)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <Icon.trash size={15} /> Remove link
            </button>
          ) : (
            <span style={{ fontSize: 11, color: 'var(--ui-faint)' }}>⌘K</span>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={closePopover} style={cancelBtn}>
              Cancel
            </button>
            <button
              type="button"
              onClick={applyLink}
              disabled={!valid}
              style={{
                fontSize: 11.5,
                fontWeight: 600,
                color: '#fff',
                background: valid ? 'var(--color-primary)' : 'color-mix(in srgb, var(--color-primary) 42%, var(--ui-surface))',
                border: 'none',
                borderRadius: 7,
                padding: '6px 15px',
                cursor: valid ? 'pointer' : 'default',
              }}
            >
              {isEdit ? 'Update' : 'Apply'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderHoverCard() {
    const c = card!;
    return (
      <div
        role="dialog"
        aria-label="Link actions"
        onMouseEnter={() => {
          overCard.current = true;
          if (hideTimer.current) clearTimeout(hideTimer.current);
        }}
        onMouseLeave={() => {
          overCard.current = false;
          scheduleHide();
        }}
        style={{
          position: 'fixed',
          top: cardPos!.top,
          left: cardPos!.left,
          zIndex: 78,
          width: 'fit-content',
          maxWidth: 360,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '7px 8px',
          background: 'var(--ui-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 9,
          boxShadow: '0 10px 32px rgba(31,41,51,.18)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <Icon.link size={14} style={{ color: 'var(--color-primary)', flex: 'none' }} />
        <a
          href={c.href}
          target="_blank"
          rel="noopener noreferrer"
          title={c.href}
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--color-primary)',
            maxWidth: 170,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            textDecoration: 'none',
            borderBottom: 'none',
          }}
        >
          {c.href.replace(/^https?:\/\//, '')}
        </a>
        <span style={{ width: 1, height: 16, background: 'var(--ui-divider)', flex: 'none' }} />
        {/* Edit + Remove mutate the doc → hidden in view mode; Copy / open-URL stay. */}
        {!viewing && (
          <CardBtn title="Edit link" color="var(--color-ui)" hover="var(--ui-hover)" onClick={() => openEditFor({ from: c.from, to: c.to }, c.href)}>
            <Icon.pencil size={15} />
          </CardBtn>
        )}
        <CardBtn title={copied ? 'Copied' : 'Copy link'} color="var(--color-ui)" hover="var(--ui-hover)" onClick={copyUrl}>
          {copied ? <Icon.check size={15} /> : <Icon.copy size={15} />}
        </CardBtn>
        {!viewing && (
          <CardBtn
            title="Remove link"
            color="var(--ui-danger)"
            hover="var(--ui-danger-bg)"
            onClick={() => {
              removeRange(c.from, c.to);
              setCard(null);
            }}
          >
            <Icon.trash size={15} />
          </CardBtn>
        )}
      </div>
    );
  }
}

/* ------------------------------ small pieces ------------------------------ */

function CardBtn({
  children,
  title,
  color,
  hover,
  onClick,
}: {
  children: ReactNode;
  title: string;
  color: string;
  hover: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      onMouseEnter={(e) => (e.currentTarget.style.background = hover)}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 24,
        height: 24,
        borderRadius: 5,
        border: 'none',
        background: 'transparent',
        color,
        cursor: 'pointer',
        flex: 'none',
      }}
    >
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          color: 'var(--color-muted)',
          textTransform: 'uppercase',
          letterSpacing: '.05em',
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

const cancelBtn: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 600,
  color: 'var(--color-ui)',
  background: 'transparent',
  border: '1px solid var(--ui-border-strong)',
  borderRadius: 7,
  padding: '6px 13px',
  cursor: 'pointer',
};

function iconBtn(size: number, color: string, radius = 6): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: size,
    height: size,
    borderRadius: radius,
    border: 'none',
    background: 'transparent',
    color,
    cursor: 'pointer',
    flex: 'none',
  };
}
