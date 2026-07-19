import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/core';
import { useDismissable } from '../hooks/useDismissable';
import { Icon } from './icons';
import { AnchoredPopover } from './NumberedListStylePicker';
import { Select } from './Select';
import {
  BULLET_PRESETS,
  defaultBulletLevelConfig,
  extendBulletDefinition,
  markerGlyph,
  type BulletDefinition,
  type BulletLevelConfig,
  type MarkerStyle,
} from '../editor/extensions/bulletList/model';
import { getActiveBulletInfo } from '../editor/extensions/bulletList/extension';

/* ------------------------------------------------------------------ *
 * Bullet-list style picker — mirrors the numbered picker (reuses its
 * AnchoredPopover shell) but with bullet-only controls: marker style,
 * custom glyph, color, size. No start-at / separator / restart.
 * ------------------------------------------------------------------ */

const MARKER_OPTIONS: { value: MarkerStyle; label: string }[] = [
  { value: 'disc', label: 'Disc  •' },
  { value: 'circle', label: 'Circle  ◦' },
  { value: 'square', label: 'Square  ▪' },
  { value: 'dash', label: 'Dash  –' },
  { value: 'arrow', label: 'Arrow  →' },
  { value: 'custom', label: 'Custom…' },
  { value: 'none', label: 'None' },
];

const LABEL_STYLE: CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: '#a3abb2',
};

const PREVIEW_INDENTS = [0, 8, 16, 0];

/* ------------------------------ preset card ------------------------------ */

function PresetCard({
  def,
  selected,
  onSelect,
  cardRef,
  onKeyNav,
  tabIndex,
}: {
  def: BulletDefinition;
  selected: boolean;
  onSelect: () => void;
  cardRef: (el: HTMLButtonElement | null) => void;
  onKeyNav: (key: string) => void;
  tabIndex: number;
}) {
  const [hover, setHover] = useState(false);
  const border = selected ? '1.5px solid #0e7490' : `1px solid ${hover ? '#a5e8f2' : '#e3e7ea'}`;
  const bg = selected ? '#f2fcfd' : hover ? '#fbfdfe' : '#ffffff';
  // 4 preview lines showing levels 1/2/3/1.
  const lines = [0, 1, 2, 0].map((d) => markerGlyph(def[d] ?? def[def.length - 1]!));
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
        padding: selected ? '9.5px 10px' : '10px',
        outline: 'none',
      }}
    >
      {selected && (
        <span aria-hidden="true" style={{ position: 'absolute', top: 5, right: 5, color: '#0e7490' }}>
          <Icon.check size={13} />
        </span>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {lines.map((glyph, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: PREVIEW_INDENTS[i] }}>
            <span
              style={{
                fontSize: 10,
                lineHeight: 1,
                width: 10,
                textAlign: 'center',
                color: '#4a5560',
                whiteSpace: 'nowrap',
              }}
            >
              {glyph}
            </span>
            <span aria-hidden="true" style={{ flex: 1, height: 4, borderRadius: 3, background: '#e3e7ea' }} />
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
}: {
  selected: number;
  onSelectPreset: (i: number) => void;
  onCustomize: () => void;
}) {
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (from: number, key: string) => {
    const COLS = 3;
    let to = from;
    if (key === 'ArrowRight') to = Math.min(BULLET_PRESETS.length - 1, from + 1);
    else if (key === 'ArrowLeft') to = Math.max(0, from - 1);
    else if (key === 'ArrowDown') to = Math.min(BULLET_PRESETS.length - 1, from + COLS);
    else if (key === 'ArrowUp') to = Math.max(0, from - COLS);
    cardRefs.current[to]?.focus();
  };
  return (
    <div
      role="menu"
      aria-label="Bullet list style"
      style={{
        width: 312,
        background: '#ffffff',
        border: '1px solid #e3e7ea',
        borderRadius: 10,
        boxShadow: '0 8px 28px rgba(31,41,51,.16)',
        padding: 10,
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {BULLET_PRESETS.map((p, i) => (
          <PresetCard
            key={p.id}
            def={extendBulletDefinition(p.levels, 3)}
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
          marginTop: 10,
          paddingTop: 9,
          borderTop: '1px solid #f2f4f5',
        }}
      >
        <button
          type="button"
          role="menuitem"
          onClick={onCustomize}
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            color: '#0e7490',
            background: 'transparent',
            border: 'none',
            padding: 0,
            whiteSpace: 'nowrap',
          }}
        >
          Customize levels…
        </button>
      </div>
    </div>
  );
}

/* ------------------------------ dialog ------------------------------ */

function CustomizeDialog({
  editor,
  initialDefinition,
  initialLevel,
  onBack,
  onClose,
}: {
  editor: Editor;
  initialDefinition: BulletDefinition;
  initialLevel: number;
  onBack: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<BulletDefinition>(() =>
    extendBulletDefinition(initialDefinition, Math.max(3, initialDefinition.length)),
  );
  const [active, setActive] = useState(Math.min(Math.max(initialLevel - 1, 0), draft.length - 1));
  const ref = useDismissable<HTMLDivElement>(true, onClose, { trapFocus: true });

  const cfg = draft[active]!;
  const patch = (p: Partial<BulletLevelConfig>) =>
    setDraft((prev) => prev.map((l, i) => (i === active ? { ...l, ...p } : l)));

  const apply = () => {
    if (!editor.isActive('bulletList')) editor.chain().focus().toggleBulletList().run();
    editor.commands.applyBulletDefinition(draft);
    onClose();
  };

  const previewText = ['Overview', 'Key details', 'Sub-point'];

  const input: CSSProperties = {
    width: '100%',
    height: 34,
    padding: '0 10px',
    borderRadius: 7,
    border: '1px solid #d7dde1',
    background: '#ffffff',
    fontSize: 12.5,
    color: '#1f2933',
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center"
      style={{ background: 'rgba(31,41,51,.28)' }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Customize bullet list"
        style={{
          width: 440,
          background: '#ffffff',
          borderRadius: 12,
          boxShadow: '0 12px 36px rgba(31,41,51,.2)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 14px', borderBottom: '1px solid #eceff1' }}>
          <button
            type="button"
            aria-label="Back to presets"
            onClick={onBack}
            style={hdrBtn('#4a5560')}
          >
            <Icon.chevronLeft size={18} />
          </button>
          <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: '#1f2933' }}>
            Customize bullet list
          </span>
          <button type="button" aria-label="Close" onClick={onClose} style={hdrBtn('#8a939b')}>
            <Icon.x size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ display: 'flex' }}>
          {/* Left rail */}
          <div style={{ width: 118, borderRight: '1px solid #eceff1', padding: '12px 10px' }}>
            <div style={{ ...LABEL_STYLE, padding: '0 4px 8px' }}>Level</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {draft.map((l, i) => {
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
                      color: isActive ? '#0e7490' : '#4a5560',
                      background: isActive ? '#e0f7fa' : 'transparent',
                    }}
                  >
                    {i + 1} — {markerGlyph(l) || '∅'}
                  </button>
                );
              })}
              <button
                type="button"
                disabled={draft.length >= 9}
                onClick={() => {
                  setDraft((prev) => [...prev, defaultBulletLevelConfig(prev.length + 1)]);
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
                  color: draft.length >= 9 ? '#c2c9cf' : '#8a939b',
                  background: 'transparent',
                }}
              >
                {draft.length + 1} +
              </button>
            </div>
          </div>

          {/* Right pane */}
          <div style={{ flex: 1, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 11 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={LABEL_STYLE}>Marker style</div>
              <Select
                variant="form"
                ariaLabel="Marker style"
                value={cfg.markerStyle}
                onChange={(v) => patch({ markerStyle: v as MarkerStyle })}
                options={MARKER_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              />
            </div>

            {cfg.markerStyle === 'custom' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={LABEL_STYLE}>Custom marker</div>
                <input
                  aria-label="Custom marker"
                  value={cfg.customMarker ?? ''}
                  maxLength={2}
                  placeholder="e.g. → ▪ ✓"
                  onChange={(e) => patch({ customMarker: e.target.value })}
                  style={{ ...input, width: 90, textAlign: 'center' }}
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: 22 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={LABEL_STYLE}>Color</div>
                <input
                  aria-label="Marker color"
                  type="color"
                  value={cfg.color ?? '#1f2933'}
                  onChange={(e) => patch({ color: e.target.value })}
                  style={{ width: 44, height: 30, border: '1px solid #d7dde1', borderRadius: 6, background: '#fff' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={LABEL_STYLE}>Size</div>
                <Select
                  variant="form"
                  ariaLabel="Marker size"
                  className="w-24"
                  value={cfg.size ?? ''}
                  onChange={(v) => patch({ size: v || null })}
                  options={[
                    { value: '', label: 'Default' },
                    { value: '0.8em', label: 'Small' },
                    { value: '1.2em', label: 'Large' },
                    { value: '1.5em', label: 'X-Large' },
                  ]}
                />
              </div>
            </div>

            {/* Live preview */}
            <div style={{ background: '#f7f9fa', border: '1px solid #eceff1', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ ...LABEL_STYLE, marginBottom: 6 }}>Preview</div>
              <div style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 13.5, color: '#1f2933', display: 'flex', flexDirection: 'column', gap: 3 }}>
                {[0, 1, 2].map((d) => {
                  const lc = draft[d] ?? draft[draft.length - 1]!;
                  const isActive = active === d;
                  return (
                    <div
                      key={d}
                      style={{
                        whiteSpace: 'nowrap',
                        paddingLeft: d * 16,
                        display: 'flex',
                        gap: 8,
                        alignItems: 'baseline',
                        ...(isActive ? { color: '#0e7490' } : {}),
                      }}
                    >
                      <span style={{ minWidth: 14, color: lc.color ?? undefined, fontSize: lc.size ?? undefined }}>
                        {markerGlyph(lc)}
                      </span>
                      {previewText[d]}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderTop: '1px solid #eceff1', background: '#fafbfc' }}>
          <button
            type="button"
            onClick={() => setDraft((prev) => prev.map((l, i) => (i === active ? defaultBulletLevelConfig(active + 1) : l)))}
            style={{ fontSize: 11.5, color: '#8a939b', background: 'transparent', border: 'none', padding: 0 }}
          >
            Reset level
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={onClose}
              style={{ fontSize: 12.5, color: '#4a5560', background: '#ffffff', border: '1px solid #d7dde1', borderRadius: 7, padding: '6px 14px' }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={apply}
              style={{ fontSize: 12.5, fontWeight: 600, color: '#ffffff', background: '#0e7490', border: '1px solid #0e7490', borderRadius: 7, padding: '6px 16px' }}
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

function hdrBtn(color: string): CSSProperties {
  return {
    display: 'inline-flex',
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    border: 'none',
    background: 'transparent',
    color,
  };
}

/* ------------------------------ entry ------------------------------ */

export function BulletListMenu({ editor }: { editor: Editor }): ReactNode {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

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

  useEffect(() => {
    if (dialogOpen) setPickerOpen(false);
  }, [dialogOpen]);

  const active = getActiveBulletInfo(editor);
  const selectedPreset = active?.presetId ? BULLET_PRESETS.findIndex((p) => p.id === active.presetId) : -1;

  const applyPreset = (i: number) => {
    const id = BULLET_PRESETS[i]!.id;
    if (!editor.isActive('bulletList')) editor.chain().focus().toggleBulletList().run();
    editor.commands.applyBulletPreset(id);
    setPickerOpen(false);
  };

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-label="Bullet list styles"
        aria-haspopup="menu"
        aria-expanded={pickerOpen}
        title="Bullet list styles"
        onClick={() => setPickerOpen((v) => !v)}
        className="inline-flex h-8 w-5 items-center justify-center rounded-[5px] text-ui hover:bg-[#eef1f3]"
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
