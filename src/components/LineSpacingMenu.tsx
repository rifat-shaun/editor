/**
 * "Line & paragraph spacing" toolbar control. A toolbar button opens a
 * Google-Docs-style dropdown: a LINE SPACING group (Single/Compact/Normal/
 * Double/Custom…), a PARAGRAPH SPACING group (add/remove space before/after —
 * the label flips with the caret block's state), and a Custom-spacing dialog.
 *
 * Open/close/dismiss/positioning match our existing dropdown component
 * (`useDismissable` + portal, glued to the trigger). Selection-safe: the
 * trigger + rows `preventDefault` on mousedown so the editor keeps its
 * selection, and every command runs through `chain().focus()`.
 */
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/core';
import { useDismissable } from '../hooks/useDismissable';
import { Icon } from './icons';
import { lineHeightAtSelection } from './lineHeightSelection';
import { paragraphSpacingAtSelection, hasSpace, MIXED } from './paragraphSpacingSelection';

const ACCENT = '#0e7490';

/** Preset key → the normalized line-height value the extension stores. */
const LINE_PRESET_VALUE: Record<string, string> = {
  single: '1',
  compact: '1.15',
  normal: '1.5',
  double: '2',
};
/** Reverse: a stored line-height → which preset row is selected (if any). */
const VALUE_TO_PRESET: Record<string, string> = { '1': 'single', '1.15': 'compact', '1.5': 'normal', '2': 'double' };

/* ------------------------------ icons ------------------------------ */

function SpacingGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M3.5 2.5v11M3.5 2.5L1.8 4.2M3.5 2.5l1.7 1.7M3.5 13.5l-1.7-1.7M3.5 13.5l1.7-1.7"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7.5 3.5h7M7.5 6.8h7M7.5 10.1h7M7.5 13.4h7"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SpaceBeforeGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 2h10" stroke={ACCENT} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M2 6h10M2 8.5h10M2 11h7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function SpaceAfterGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 3h10M2 5.5h10M2 8h7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M2 12h10" stroke={ACCENT} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/** 8px ▾ chevron for the trigger. */
function MiniChevron() {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M1.5 2.75 4 5.25l2.5-2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** ▸ affordance on the Custom line-spacing row. */
function RowCaret() {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M2.75 1.5 5.25 4l-2.5 2.5" stroke="#a3abb2" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ------------------------------ styles ------------------------------ */

const SYSTEM_FONT =
  'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const groupLabelStyle: CSSProperties = {
  fontFamily: SYSTEM_FONT,
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  color: '#a3abb2',
  letterSpacing: '0.06em',
  padding: '6px 10px 3px',
};

const rowBaseStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  padding: '6px 10px',
  borderRadius: 6,
  fontFamily: SYSTEM_FONT,
  fontSize: 12.5,
  color: '#3d4652',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  border: 'none',
  background: 'transparent',
  width: '100%',
  textAlign: 'left',
};

const hintStyle: CSSProperties = {
  fontFamily: SYSTEM_FONT,
  fontSize: 10.5,
  color: '#a3abb2',
  textAlign: 'right',
};

/* ------------------------------ rows ------------------------------ */

type LineOption = { key: string; label: string; hint?: string; caret?: boolean };
const LINE_OPTIONS: LineOption[] = [
  { key: 'single', label: 'Single', hint: '1.0' },
  { key: 'compact', label: 'Compact', hint: '1.15' },
  { key: 'normal', label: 'Normal', hint: '1.5' },
  { key: 'double', label: 'Double', hint: '2.0' },
  { key: 'custom', label: 'Custom…', caret: true },
];

function Row({
  children,
  selected = false,
  hovered,
  onHoverChange,
  rowKey,
  role = 'menuitem',
  ariaChecked,
  onClick,
}: {
  children: React.ReactNode;
  selected?: boolean;
  hovered: string | null;
  onHoverChange: (k: string | null) => void;
  rowKey: string;
  role?: string;
  ariaChecked?: boolean;
  onClick?: () => void;
}) {
  const isHover = hovered === rowKey;
  const bg = selected ? '#f2fcfd' : isHover ? '#f7f9fa' : 'transparent';
  return (
    <button
      type="button"
      role={role}
      aria-checked={ariaChecked}
      // Selection-safe: don't blur the editor's contenteditable, so the current
      // selection stays active and the command applies to it.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      onMouseEnter={() => onHoverChange(rowKey)}
      onMouseLeave={() => onHoverChange(null)}
      style={{ ...rowBaseStyle, background: bg }}
    >
      {children}
    </button>
  );
}

/* ------------------------------ component ------------------------------ */

export function LineSpacingMenu({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [btnHover, setBtnHover] = useState(false);

  const openCustom = () => {
    setOpen(false);
    setDialogOpen(true);
  };
  const anchorRef = useRef<HTMLButtonElement>(null);
  const panelRef = useDismissable<HTMLDivElement>(open, () => setOpen(false), { trapFocus: true });

  const toggle = () => {
    const r = anchorRef.current?.getBoundingClientRect();
    if (r) setRect(r);
    setOpen((v) => !v);
  };

  // Keep the panel glued to the trigger while scrolling/resizing (matches Menu).
  useLayoutEffect(() => {
    if (!open) return;
    const reposition = () => {
      const r = anchorRef.current?.getBoundingClientRect();
      if (r) setRect(r);
    };
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open]);

  const btnStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    height: 28,
    padding: '5px 6px',
    borderRadius: 5,
    border: 'none',
    cursor: 'pointer',
    color: open ? ACCENT : '#4a5560',
    background: open ? '#e0f7fa' : btnHover ? '#f2f4f5' : 'transparent',
  };

  const panelStyle: CSSProperties = rect
    ? {
        position: 'fixed',
        top: Math.round(rect.bottom + 4),
        left: Math.round(rect.left),
        width: 240,
        background: '#fff',
        border: '1px solid #e3e7ea',
        borderRadius: 9,
        boxShadow: '0 10px 32px rgba(31, 41, 51, 0.18)',
        padding: 5,
        zIndex: 60,
      }
    : {};

  // Reactive reads at the caret/selection (the parent toolbar re-renders on
  // selectionUpdate/transaction, so these stay current).
  const lh = lineHeightAtSelection(editor); // preset value, 'default', or null (mixed)
  const selectedPreset = lh && lh !== MIXED ? VALUE_TO_PRESET[lh] : undefined;
  const spacing = paragraphSpacingAtSelection(editor);
  const beforeOn = hasSpace(spacing.before);
  const afterOn = hasSpace(spacing.after);

  const applyLine = (key: string) => {
    editor.chain().focus().setLineHeight(LINE_PRESET_VALUE[key]!).run();
    setOpen(false);
  };
  const toggleBefore = () => {
    const c = editor.chain().focus();
    (beforeOn ? c.removeSpaceBefore() : c.addSpaceBefore()).run();
    setOpen(false);
  };
  const toggleAfter = () => {
    const c = editor.chain().focus();
    (afterOn ? c.removeSpaceAfter() : c.addSpaceAfter()).run();
    setOpen(false);
  };

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-label="Line & paragraph spacing"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Line & paragraph spacing"
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggle}
        onMouseEnter={() => setBtnHover(true)}
        onMouseLeave={() => setBtnHover(false)}
        style={btnStyle}
      >
        <SpacingGlyph />
        <MiniChevron />
      </button>

      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[55]" aria-hidden="true" onClick={() => setOpen(false)} />
            <div ref={panelRef} role="menu" aria-label="Line & paragraph spacing" style={panelStyle}>
              {/* LINE SPACING */}
              <div style={groupLabelStyle}>Line spacing</div>
              {LINE_OPTIONS.map((o) => {
                const selected = o.key === selectedPreset;
                return (
                  <Row
                    key={o.key}
                    rowKey={o.key}
                    role="menuitemradio"
                    ariaChecked={selected}
                    selected={selected}
                    hovered={hovered}
                    onHoverChange={setHovered}
                    onClick={o.key === 'custom' ? openCustom : () => applyLine(o.key)}
                  >
                    <span style={{ color: selected ? '#1f2933' : '#3d4652', fontWeight: selected ? 600 : 400 }}>
                      {o.label}
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      {o.hint && <span style={hintStyle}>{o.hint}</span>}
                      {o.caret && <RowCaret />}
                      {selected && (
                        <span style={{ fontSize: 12, fontWeight: 700, color: ACCENT, lineHeight: 1 }}>✓</span>
                      )}
                    </span>
                  </Row>
                );
              })}

              {/* PARAGRAPH SPACING */}
              <div style={{ ...groupLabelStyle, borderTop: '1px solid #f2f4f5', marginTop: 5 }}>
                Paragraph spacing
              </div>
              <Row rowKey="before" hovered={hovered} onHoverChange={setHovered} onClick={toggleBefore}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <SpaceBeforeGlyph />
                  {beforeOn ? 'Remove space before paragraph' : 'Add space before paragraph'}
                </span>
              </Row>
              <Row rowKey="after" hovered={hovered} onHoverChange={setHovered} onClick={toggleAfter}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <SpaceAfterGlyph />
                  {afterOn ? 'Remove space after paragraph' : 'Add space after paragraph'}
                </span>
              </Row>

              {/* FOOTER */}
              <div style={{ borderTop: '1px solid #f2f4f5', margin: '4px 6px' }} />
              <Row rowKey="custom-footer" hovered={hovered} onHoverChange={setHovered} onClick={openCustom}>
                <span>Custom spacing…</span>
              </Row>
            </div>
          </>,
          document.body,
        )}

      {dialogOpen && <CustomSpacingDialog editor={editor} onClose={() => setDialogOpen(false)} />}
    </>
  );
}

/* ---------------------- custom spacing dialog ---------------------- */

function Stepper({
  valueLabel,
  valueColor = '#1f2933',
  onDec,
  onInc,
}: {
  valueLabel: string;
  valueColor?: string;
  onDec: () => void;
  onInc: () => void;
}) {
  const btn: CSSProperties = {
    width: 32,
    height: 30,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#fff',
    border: 'none',
    color: '#4a5560',
    cursor: 'pointer',
  };
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        border: '1px solid #d7dde1',
        borderRadius: 6,
        overflow: 'hidden',
      }}
    >
      <button type="button" aria-label="Decrease" onClick={onDec} style={btn}>
        <Icon.minus size={14} />
      </button>
      <span
        style={{
          minWidth: 46,
          textAlign: 'center',
          fontFamily: SYSTEM_FONT,
          fontSize: 12.5,
          fontWeight: valueColor === ACCENT ? 600 : 400,
          color: valueColor,
          borderLeft: '1px solid #eceff1',
          borderRight: '1px solid #eceff1',
          padding: '6px 4px',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {valueLabel}
      </span>
      <button type="button" aria-label="Increase" onClick={onInc} style={btn}>
        <Icon.plus size={14} />
      </button>
    </div>
  );
}

const PT_PER_PX = 96 / 72; // pt → px for the live preview

const sectionLabel: CSSProperties = {
  fontFamily: SYSTEM_FONT,
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: '#a3abb2',
  marginBottom: 7,
};

const fmt = (n: number) => (Math.round(n * 100) / 100).toString();

/** Parse a "<n>pt" spacing value (or MIXED/null) to a point number for the dialog. */
function spacingPt(value: string | null | typeof MIXED): number {
  return typeof value === 'string' && value !== MIXED ? parseFloat(value) || 0 : 0;
}

function CustomSpacingDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  // Seed from the caret block so the dialog reflects the current values.
  const initial = (() => {
    const lh = lineHeightAtSelection(editor);
    const line = lh && lh !== MIXED ? parseFloat(lh) : NaN;
    const sp = paragraphSpacingAtSelection(editor);
    return {
      line: Number.isFinite(line) ? line : 1.5,
      before: spacingPt(sp.before),
      after: spacingPt(sp.after),
    };
  })();
  const [line, setLine] = useState(initial.line);
  const [before, setBefore] = useState(initial.before);
  const [after, setAfter] = useState(initial.after);
  const ref = useDismissable<HTMLDivElement>(true, onClose, { trapFocus: true });

  const reset = () => {
    setLine(initial.line);
    setBefore(initial.before);
    setAfter(initial.after);
  };

  const apply = () => {
    editor
      .chain()
      .focus()
      .setLineHeight(String(line))
      .setParagraphSpacing({ before, after })
      .run();
    onClose();
  };

  const ptColor = (n: number) => (n > 0 ? ACCENT : '#1f2933');

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center"
      style={{ background: 'rgba(31,41,51,.28)' }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Custom spacing"
        style={{
          width: 320,
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 12px 36px rgba(31,41,51,.2)',
          fontFamily: SYSTEM_FONT,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '15px 18px 0' }}>
          <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: '#1f2933' }}>Custom spacing</span>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{
              display: 'inline-flex',
              width: 24,
              height: 24,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 6,
              border: 'none',
              background: 'transparent',
              color: '#8a939b',
              cursor: 'pointer',
            }}
          >
            <Icon.x size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 18px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Line spacing */}
          <div>
            <div style={sectionLabel}>Line spacing</div>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <Stepper
                valueLabel={fmt(line)}
                onDec={() => setLine((v) => Math.max(0.5, Math.round((v - 0.05) * 100) / 100))}
                onInc={() => setLine((v) => Math.min(5, Math.round((v + 0.05) * 100) / 100))}
              />
              <span style={{ marginLeft: 10, fontSize: 12.5, color: '#8a939b' }}>× line height</span>
            </div>
          </div>

          {/* Space before / after */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <div style={sectionLabel}>Space before</div>
              <Stepper
                valueLabel={`${before} pt`}
                valueColor={ptColor(before)}
                onDec={() => setBefore((v) => Math.max(0, v - 1))}
                onInc={() => setBefore((v) => v + 1)}
              />
            </div>
            <div>
              <div style={sectionLabel}>Space after</div>
              <Stepper
                valueLabel={`${after} pt`}
                valueColor={ptColor(after)}
                onDec={() => setAfter((v) => Math.max(0, v - 1))}
                onInc={() => setAfter((v) => v + 1)}
              />
            </div>
          </div>

          {/* Preview */}
          <div style={{ border: '1px solid #eceff1', borderRadius: 8, padding: '10px 12px', background: '#fafbfc' }}>
            <div style={{ ...sectionLabel, marginBottom: 6 }}>Preview</div>
            <div style={{ fontFamily: "'Times New Roman', Georgia, serif", fontSize: 13, color: '#1f2933' }}>
              {[
                'The obligations herein shall survive termination.',
                'Each party shall return all Confidential Information upon written request of the other.',
              ].map((t, i) => (
                <p
                  key={i}
                  style={{
                    margin: 0,
                    lineHeight: line,
                    marginTop: i === 0 ? 0 : before / PT_PER_PX,
                    marginBottom: after / PT_PER_PX,
                  }}
                >
                  {t}
                </p>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 18px 16px',
          }}
        >
          <button
            type="button"
            onClick={reset}
            style={{ fontSize: 12, color: '#8a939b', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
          >
            Reset
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                fontSize: 12.5,
                color: '#4a5560',
                background: '#fff',
                border: '1px solid #d7dde1',
                borderRadius: 7,
                padding: '6px 14px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={apply}
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                color: '#fff',
                background: ACCENT,
                border: `1px solid ${ACCENT}`,
                borderRadius: 7,
                padding: '6px 16px',
                cursor: 'pointer',
              }}
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
