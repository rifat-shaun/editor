import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/core';
import { useDismissable } from '../hooks/useDismissable';
import { Icon } from './icons';
import { Select } from './Select';
import {
  defaultLevelConfig,
  extendDefinition,
  formatValue,
  levelSummary,
  renderMarker,
  type ListDefinition,
  type ListLevelConfig,
  type NumberStyle,
  type Separator,
} from '../editor/extensions/listNumbering/model';
import { getActiveListInfo } from '../editor/extensions/listNumbering/extension';

/* ------------------------------------------------------------------ *
 * Numbered-list style picker — wired to the numbering engine.
 *
 * Two surfaces: (A) a preset dropdown from the numbered-list toolbar
 * caret (applies an engine preset to the list at the cursor), and (B) a
 * "Customize levels" modal that edits a LOCAL draft of the current list's
 * definition with a live preview and commits it on Apply. All formatting
 * math is imported from the engine `model` so the preview matches what
 * actually renders.
 * ------------------------------------------------------------------ */

const NUMBER_STYLE_OPTIONS: { value: NumberStyle; label: string }[] = [
  { value: 'decimal', label: 'Decimal (1, 2, 3)' },
  { value: 'decimalZero', label: 'Zero-padded (01, 02)' },
  { value: 'lowerAlpha', label: 'Lowercase letter (a, b, c)' },
  { value: 'upperAlpha', label: 'Uppercase letter (A, B, C)' },
  { value: 'lowerRoman', label: 'Lowercase roman (i, ii, iii)' },
  { value: 'upperRoman', label: 'Uppercase roman (I, II, III)' },
];

/* ----------------------------- presets ---------------------------- */

interface PresetCardDef {
  /** Engine preset id (see model.PRESETS). */
  id: string;
  /** The 4 preview marker lines (levels 1/2/3/1) — decorative miniature. */
  markers: [string, string, string, string];
}
const PRESET_CARDS: PresetCardDef[] = [
  { id: 'decimal', markers: ['1.', 'a.', 'i.', '2.'] },
  { id: 'paren', markers: ['1)', 'a)', 'i)', '2)'] },
  { id: 'legal', markers: ['1.', '1.1.', '1.2.1.', '2.'] },
  { id: 'upperAlpha', markers: ['A.', 'a.', 'i.', 'B.'] },
  { id: 'upperRoman', markers: ['I.', 'A.', 'i.', 'II.'] },
  { id: 'zero', markers: ['01.', 'a.', 'i.', '02.'] },
];
/** Per-line indent for the 4 preview lines (levels 1/2/3/1). */
const PREVIEW_INDENTS = [0, 8, 16, 0];

/* ====================================================================
 * Small shared popover (portal + anchor + dismiss) so surface (A) can
 * be styled to the exact spec without fighting the generic Menu panel.
 * ==================================================================== */
export function AnchoredPopover({
  anchor,
  open,
  onClose,
  children,
}: {
  anchor: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const ref = useDismissable<HTMLDivElement>(open, onClose, { trapFocus: true });

  useLayoutEffect(() => {
    if (!open || !anchor) return;
    const reposition = () => setRect(anchor.getBoundingClientRect());
    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, anchor]);

  if (!open || !rect) return null;
  const style: CSSProperties = {
    position: 'fixed',
    top: Math.round(rect.bottom + 6),
    left: Math.round(Math.min(rect.left, window.innerWidth - 320)),
    zIndex: 60,
  };
  return createPortal(
    <>
      <div className="fixed inset-0 z-[55]" aria-hidden="true" onClick={onClose} />
      <div ref={ref} style={style}>
        {children}
      </div>
    </>,
    document.body,
  );
}

/* ====================================================================
 * (A) PRESET PICKER
 * ==================================================================== */

function PresetCard({
  preset,
  selected,
  onSelect,
  cardRef,
  onKeyNav,
  tabIndex,
}: {
  preset: PresetCardDef;
  selected: boolean;
  onSelect: () => void;
  cardRef: (el: HTMLButtonElement | null) => void;
  onKeyNav: (key: string) => void;
  tabIndex: number;
}) {
  const [hover, setHover] = useState(false);
  const border = selected ? '1.5px solid var(--color-primary)' : `1px solid ${hover ? 'var(--color-primary-border)' : 'var(--color-border)'}`;
  const bg = selected ? 'var(--ui-selected)' : hover ? 'var(--ui-surface-2)' : 'var(--ui-surface)';
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      ref={cardRef}
      tabIndex={tabIndex}
      onClick={onSelect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onKeyDown={(e) => {
        if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
          e.preventDefault();
          onKeyNav(e.key);
        }
      }}
      style={{
        position: 'relative',
        display: 'block',
        textAlign: 'left',
        border,
        borderRadius: 8,
        background: bg,
        // Keep the 1.5px selected border from shifting layout vs the 1px default.
        padding: selected ? '9.5px 10px' : '10px',
        outline: 'none',
      }}
    >
      {selected && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 5,
            right: 5,
            display: 'inline-flex',
            color: 'var(--color-primary)',
          }}
        >
          <Icon.check size={13} />
        </span>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {preset.markers.map((m, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              paddingLeft: PREVIEW_INDENTS[i],
            }}
          >
            <span
              style={{
                fontSize: 9.5,
                lineHeight: 1,
                color: 'var(--ui-text-soft)',
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
              }}
            >
              {m}
            </span>
            <span
              aria-hidden="true"
              style={{ flex: 1, height: 4, borderRadius: 3, background: 'var(--color-border)' }}
            />
          </div>
        ))}
      </div>
    </button>
  );
}

function PresetPicker({
  selected,
  onSelectPreset,
  onCustomize,
  onRestart,
}: {
  selected: number;
  onSelectPreset: (i: number) => void;
  onCustomize: () => void;
  onRestart: () => void;
}) {
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const move = (from: number, key: string) => {
    const COLS = 3;
    let to = from;
    if (key === 'ArrowRight') to = Math.min(PRESET_CARDS.length - 1, from + 1);
    else if (key === 'ArrowLeft') to = Math.max(0, from - 1);
    else if (key === 'ArrowDown') to = Math.min(PRESET_CARDS.length - 1, from + COLS);
    else if (key === 'ArrowUp') to = Math.max(0, from - COLS);
    cardRefs.current[to]?.focus();
  };

  return (
    <div
      role="menu"
      aria-label="Numbered list style"
      style={{
        width: 312,
        background: 'var(--ui-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 10,
        boxShadow: '0 8px 28px rgba(31,41,51,.16)',
        padding: 10,
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {PRESET_CARDS.map((p, i) => (
          <PresetCard
            key={p.id}
            preset={p}
            selected={selected === i}
            tabIndex={i === selected || (selected < 0 && i === 0) ? 0 : -1}
            cardRef={(el) => (cardRefs.current[i] = el)}
            onKeyNav={(key) => move(i, key)}
            onSelect={() => onSelectPreset(i)}
          />
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 10,
          paddingTop: 9,
          borderTop: '1px solid var(--ui-hover)',
        }}
      >
        <button
          type="button"
          role="menuitem"
          onClick={onCustomize}
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            color: 'var(--color-primary)',
            background: 'transparent',
            border: 'none',
            padding: 0,
            whiteSpace: 'nowrap',
          }}
        >
          Customize levels…
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={onRestart}
          style={{
            fontSize: 11,
            color: 'var(--color-muted)',
            background: 'transparent',
            border: 'none',
            padding: 0,
            whiteSpace: 'nowrap',
          }}
        >
          Restart numbering
        </button>
      </div>
    </div>
  );
}

/* ====================================================================
 * (B) CUSTOMIZE LEVELS DIALOG
 * ==================================================================== */

const LABEL_STYLE: CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--ui-faint)',
};

function Stepper({
  valueLabel,
  onDec,
  onInc,
}: {
  valueLabel: string;
  onDec: () => void;
  onInc: () => void;
}) {
  const btn: CSSProperties = {
    width: 30,
    height: 28,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--ui-surface)',
    border: 'none',
    color: 'var(--color-ui)',
  };
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        border: '1px solid var(--ui-border-strong)',
        borderRadius: 6,
        overflow: 'hidden',
      }}
    >
      <button type="button" aria-label="Decrease start value" onClick={onDec} style={btn}>
        <Icon.minus size={14} />
      </button>
      <span
        style={{
          minWidth: 30,
          textAlign: 'center',
          fontSize: 12.5,
          color: 'var(--color-ink)',
          borderLeft: '1px solid var(--ui-divider)',
          borderRight: '1px solid var(--ui-divider)',
          padding: '5px 4px',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {valueLabel}
      </span>
      <button type="button" aria-label="Increase start value" onClick={onInc} style={btn}>
        <Icon.plus size={14} />
      </button>
    </div>
  );
}

function SeparatorSegmented({
  value,
  onChange,
}: {
  value: Separator;
  onChange: (s: Separator) => void;
}) {
  const opts: { value: Separator; label: string }[] = [
    { value: 'dot', label: 'a.' },
    { value: 'paren', label: 'a)' },
    { value: 'parens', label: '(a)' },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Separator"
      style={{
        display: 'inline-flex',
        gap: 2,
        background: 'var(--ui-hover)',
        borderRadius: 7,
        padding: 2,
      }}
    >
      {opts.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            style={{
              minWidth: 40,
              padding: '4px 10px',
              borderRadius: 5,
              border: 'none',
              fontSize: 12,
              fontWeight: active ? 600 : 500,
              color: active ? 'var(--color-primary)' : 'var(--color-ui)',
              background: active ? 'var(--ui-surface)' : 'transparent',
              boxShadow: active ? '0 1px 2px rgba(31,41,51,.12)' : 'none',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: ReactNode;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onChange}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        background: 'transparent',
        border: 'none',
        padding: 0,
        color: 'var(--color-ink)',
        fontSize: 12.5,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 13,
          height: 13,
          borderRadius: 3,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: checked ? 'var(--color-primary)' : 'var(--ui-surface)',
          border: checked ? '1px solid var(--color-primary)' : '1px solid var(--ui-disabled)',
          color: '#ffffff',
          flexShrink: 0,
        }}
      >
        {checked && <Icon.check size={9} />}
      </span>
      {label}
    </button>
  );
}

function CustomizeDialog({
  editor,
  initialDefinition,
  initialLevel,
  onBack,
  onClose,
}: {
  editor: Editor;
  initialDefinition: ListDefinition;
  initialLevel: number; // 1-based
  onBack: () => void;
  onClose: () => void;
}) {
  // Local DRAFT — edits do not touch the document until Apply.
  const [draft, setDraft] = useState<ListDefinition>(() =>
    extendDefinition(initialDefinition, Math.max(3, initialDefinition.length)),
  );
  const [active, setActive] = useState(Math.min(Math.max(initialLevel - 1, 0), draft.length - 1));
  const ref = useDismissable<HTMLDivElement>(true, onClose, { trapFocus: true });

  const cfg = draft[active]!;
  const patch = (p: Partial<ListLevelConfig>) =>
    setDraft((prev) => prev.map((l, i) => (i === active ? { ...l, ...p } : l)));

  // Live preview: first item at every level (counts all 1) using the DRAFT, so
  // it renders exactly what the engine will produce on Apply.
  const previewLine = (depth: number): string =>
    renderMarker(draft, depth + 1, [1, 1, 1, 1, 1, 1, 1, 1, 1]);
  const previewText = ['Confidentiality Obligations', 'Duty of care', 'Standard exceptions'];

  const apply = () => {
    // If the cursor drifted out of a list, wrap it first so Apply has a target.
    if (!editor.isActive('orderedList')) editor.chain().focus().toggleOrderedList().run();
    editor.commands.applyListDefinition(draft);
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center"
      style={{ background: 'var(--ui-scrim)' }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Customize numbered list"
        style={{
          width: 440,
          background: 'var(--ui-surface)',
          borderRadius: 12,
          boxShadow: '0 12px 36px rgba(31,41,51,.2)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '13px 14px',
            borderBottom: '1px solid var(--ui-divider)',
          }}
        >
          <button
            type="button"
            aria-label="Back to presets"
            onClick={onBack}
            style={{
              display: 'inline-flex',
              width: 24,
              height: 24,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 6,
              border: 'none',
              background: 'transparent',
              color: 'var(--color-ui)',
            }}
          >
            <Icon.chevronLeft size={18} />
          </button>
          <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: 'var(--color-ink)' }}>
            Customize numbered list
          </span>
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
              color: 'var(--color-muted)',
            }}
          >
            <Icon.x size={16} />
          </button>
        </div>

        {/* Body — two panes */}
        <div style={{ display: 'flex' }}>
          {/* Left rail */}
          <div style={{ width: 118, borderRight: '1px solid var(--ui-divider)', padding: '12px 10px' }}>
            <div style={{ ...LABEL_STYLE, padding: '0 4px 8px' }}>Level</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {draft.map((_, i) => {
                const isActive = active === i;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setActive(i)}
                    style={{
                      display: 'flex',
                      width: '100%',
                      textAlign: 'left',
                      padding: '6px 10px',
                      borderRadius: 6,
                      border: 'none',
                      fontSize: 12,
                      fontWeight: isActive ? 600 : 400,
                      color: isActive ? 'var(--color-primary)' : 'var(--color-ui)',
                      background: isActive ? 'var(--color-primary-soft)' : 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'var(--ui-hover)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    {i + 1} — {levelSummary(draft, i + 1)}
                  </button>
                );
              })}
              <button
                type="button"
                disabled={draft.length >= 9}
                onClick={() => {
                  setDraft((prev) => [...prev, defaultLevelConfig(prev.length + 1)]);
                  setActive(draft.length);
                }}
                style={{
                  display: 'flex',
                  width: '100%',
                  textAlign: 'left',
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: 'none',
                  fontSize: 12,
                  color: draft.length >= 9 ? 'var(--ui-disabled)' : 'var(--color-muted)',
                  background: 'transparent',
                }}
              >
                {draft.length + 1} +
              </button>
            </div>
          </div>

          {/* Right pane */}
          <div
            style={{ flex: 1, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 11 }}
          >
            {/* Number style */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={LABEL_STYLE}>Number style</div>
              <Select
                variant="form"
                ariaLabel="Number style"
                value={cfg.style}
                onChange={(v) => patch({ style: v as NumberStyle })}
                options={NUMBER_STYLE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              />
            </div>

            {/* Separator + Start at */}
            <div style={{ display: 'flex', gap: 22 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={LABEL_STYLE}>Separator</div>
                <SeparatorSegmented
                  value={cfg.separator}
                  onChange={(separator) => patch({ separator })}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={LABEL_STYLE}>Start at</div>
                <Stepper
                  valueLabel={formatValue(cfg.startAt, cfg.style)}
                  onDec={() => patch({ startAt: Math.max(1, cfg.startAt - 1) })}
                  onInc={() => patch({ startAt: cfg.startAt + 1 })}
                />
              </div>
            </div>

            {/* Include parent */}
            <Checkbox
              checked={cfg.includeParent}
              onChange={() => patch({ includeParent: !cfg.includeParent })}
              label={<span>Include parent number (1.a)</span>}
            />

            {/* Live preview */}
            <div
              style={{
                background: 'var(--ui-row-hover)',
                border: '1px solid var(--ui-divider)',
                borderRadius: 8,
                padding: '10px 12px',
              }}
            >
              <div style={{ ...LABEL_STYLE, marginBottom: 6 }}>Preview</div>
              <div
                style={{
                  fontFamily: "'Times New Roman', Georgia, serif",
                  fontSize: 13.5,
                  color: 'var(--color-ink)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3,
                }}
              >
                {[0, 1, 2].map((d) => {
                  const isActive = active === d;
                  return (
                    <div
                      key={d}
                      style={{
                        whiteSpace: 'nowrap',
                        paddingLeft: d * 14,
                        borderRadius: 4,
                        padding: `1px ${d === 0 ? 0 : 0}px 1px ${d * 14}px`,
                        ...(isActive
                          ? { background: 'var(--color-primary-soft)', color: 'var(--color-primary)', width: 'fit-content' }
                          : {}),
                      }}
                    >
                      {previewLine(d)} {previewText[d]}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 16px',
            borderTop: '1px solid var(--ui-divider)',
            background: 'var(--color-chrome)',
          }}
        >
          <button
            type="button"
            onClick={() =>
              setDraft((prev) => prev.map((l, i) => (i === active ? defaultLevelConfig(active + 1) : l)))
            }
            style={{
              fontSize: 11.5,
              color: 'var(--color-muted)',
              background: 'transparent',
              border: 'none',
              padding: 0,
            }}
          >
            Reset level
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                fontSize: 12.5,
                color: 'var(--color-ui)',
                background: 'var(--ui-surface)',
                border: '1px solid var(--ui-border-strong)',
                borderRadius: 7,
                padding: '6px 14px',
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
                color: '#ffffff',
                background: 'var(--color-primary)',
                border: '1px solid var(--color-primary)',
                borderRadius: 7,
                padding: '6px 16px',
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

/* ====================================================================
 * Public entry — the caret trigger that hosts both surfaces.
 * ==================================================================== */

export function NumberedListMenu({ editor }: { editor: Editor }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  // Re-render on selection/doc changes so the selected-card + dialog reflect
  // the list at the cursor.
  const [, bump] = useState(0);
  useEffect(() => {
    const rerender = () => bump((n) => n + 1);
    editor.on('selectionUpdate', rerender);
    editor.on('transaction', rerender);
    return () => {
      editor.off('selectionUpdate', rerender);
      editor.off('transaction', rerender);
    };
  }, [editor]);

  // Close the picker with Escape handled by AnchoredPopover; caret toggles it.
  useEffect(() => {
    if (dialogOpen) setPickerOpen(false);
  }, [dialogOpen]);

  const active = getActiveListInfo(editor);
  const selectedPreset = active?.presetId
    ? PRESET_CARDS.findIndex((p) => p.id === active.presetId)
    : -1;

  const applyPreset = (i: number) => {
    const id = PRESET_CARDS[i]!.id;
    // Ensure there's an ordered list to target (the caret is always visible).
    if (!editor.isActive('orderedList')) editor.chain().focus().toggleOrderedList().run();
    editor.commands.applyListPreset(id);
    setPickerOpen(false);
  };

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-label="Numbered list styles"
        aria-haspopup="menu"
        aria-expanded={pickerOpen}
        title="Numbered list styles"
        onClick={() => setPickerOpen((v) => !v)}
        className="inline-flex h-8 w-5 items-center justify-center rounded-[5px] text-ui hover:bg-[var(--ui-hover)]"
      >
        <Icon.chevronDown size={13} />
      </button>

      <AnchoredPopover anchor={anchorRef.current} open={pickerOpen} onClose={() => setPickerOpen(false)}>
        <PresetPicker
          selected={selectedPreset}
          onSelectPreset={applyPreset}
          onCustomize={() => {
            setPickerOpen(false);
            setDialogOpen(true);
          }}
          onRestart={() => {
            editor.commands.restartNumbering();
            setPickerOpen(false);
          }}
        />
      </AnchoredPopover>

      {dialogOpen && (
        <CustomizeDialog
          editor={editor}
          initialDefinition={active?.definition ?? []}
          initialLevel={active?.level ?? 1}
          onBack={() => {
            setDialogOpen(false);
            setPickerOpen(true);
          }}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </>
  );
}
