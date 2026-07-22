/**
 * Page setup dialog (design 20b). Edits a DRAFT copy of the document's page
 * geometry with a live preview; commits on OK via `setPageSetup` (one undoable
 * step, stored on the doc). Cancel / Esc / backdrop / ✕ discard.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/core';
import { useDismissable } from '../hooks/useDismissable';
import { Select } from '../components/Select';
import { TextField } from '../components/TextField';
import {
  type PageSetup,
  type MarginPresetKey,
  PAPER_SIZES,
  PAPER_ORDER,
  MARGIN_PRESETS,
  MARGIN_PRESET_ORDER,
  matchMarginPreset,
  maxMargin,
  captionLines,
  pagePx,
  marginsPx,
  DEFAULT_PAGE_SETUP,
  MIN_MARGIN_IN,
} from './pageSetup';

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const SECTION_LABEL: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--color-muted)',
  textTransform: 'uppercase',
  letterSpacing: '.05em',
  whiteSpace: 'nowrap',
};

type Side = 'top' | 'right' | 'bottom' | 'left';
const SIDES: Side[] = ['top', 'bottom', 'left', 'right']; // field layout order

function marginStrings(m: PageSetup['margins']): Record<Side, string> {
  return { top: m.top.toFixed(1), right: m.right.toFixed(1), bottom: m.bottom.toFixed(1), left: m.left.toFixed(1) };
}

export function PageSetupDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const initial = (editor.state.doc.attrs.pageSetup as PageSetup | null) ?? DEFAULT_PAGE_SETUP;
  const [orientation, setOrientation] = useState(initial.orientation);
  const [paperSize, setPaperSize] = useState(initial.paperSize);
  const [mStr, setMStr] = useState<Record<Side, string>>(marginStrings(initial.margins));

  const ref = useDismissable<HTMLDivElement>(true, onClose, { trapFocus: true });
  const orientationRef = useRef<HTMLButtonElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  // Scroll-lock + initial focus (Orientation) + focus restore.
  useEffect(() => {
    returnTo.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
      returnTo.current?.focus?.();
    };
  }, []);
  useLayoutEffect(() => {
    orientationRef.current?.focus();
  }, []);

  const nums = useMemo(
    () => ({ top: parseFloat(mStr.top), right: parseFloat(mStr.right), bottom: parseFloat(mStr.bottom), left: parseFloat(mStr.left) }),
    [mStr],
  );
  const draft: PageSetup = useMemo(
    () => ({
      orientation,
      paperSize,
      margins: {
        top: Number.isFinite(nums.top) ? nums.top : 0,
        right: Number.isFinite(nums.right) ? nums.right : 0,
        bottom: Number.isFinite(nums.bottom) ? nums.bottom : 0,
        left: Number.isFinite(nums.left) ? nums.left : 0,
      },
      marginPreset: null,
    }),
    [orientation, paperSize, nums],
  );
  const activePreset = matchMarginPreset(draft.margins);

  const errorFor = (s: Side): boolean => {
    const v = nums[s];
    return !Number.isFinite(v) || v < MIN_MARGIN_IN || v > maxMargin(draft, s);
  };
  const anyError = SIDES.some(errorFor);

  const selectPreset = (key: MarginPresetKey) => setMStr(marginStrings(MARGIN_PRESETS[key]));

  const commit = () => {
    if (anyError) return;
    editor.commands.setPageSetup({ ...draft, marginPreset: matchMarginPreset(draft.margins) });
    onClose();
  };

  /* ------- preview geometry ------- */
  const mini = orientation === 'landscape' ? { w: 134, h: 104 } : { w: 104, h: 134 };
  const page = pagePx(draft);
  const mpx = marginsPx(draft);
  const guide: CSSProperties = {
    top: (mpx.top / page.height) * mini.h,
    bottom: (mpx.bottom / page.height) * mini.h,
    left: (mpx.left / page.width) * mini.w,
    right: (mpx.right / page.width) * mini.w,
  };
  const [capA, capB] = captionLines(draft);

  const paperOptions = PAPER_ORDER.map((k) => ({ value: k, label: `${PAPER_SIZES[k].label} (${PAPER_SIZES[k].dim})` }));

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center"
      style={{ background: 'var(--ui-scrim)' }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !anyError) {
          e.preventDefault();
          commit();
        }
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Page setup"
        style={{ width: 580, background: 'var(--ui-surface)', borderRadius: 12, boxShadow: '0 24px 64px rgba(31,41,51,.35)', fontFamily: FONT, color: 'var(--ui-text)' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '15px 20px 13px', borderBottom: '1px solid var(--ui-divider)' }}>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--color-ink)' }}>Page setup</span>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{ display: 'inline-flex', width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--color-muted)', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ display: 'flex' }}>
          {/* Left — controls */}
          <div style={{ flex: 1, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14, borderRight: '1px solid var(--ui-divider)' }}>
            {/* Orientation */}
            <div>
              <div style={{ ...SECTION_LABEL, marginBottom: 6 }}>Orientation</div>
              <div style={{ display: 'flex', gap: 0, background: 'var(--ui-hover)', borderRadius: 7, padding: 2 }} role="radiogroup" aria-label="Orientation">
                {(['portrait', 'landscape'] as const).map((o) => {
                  const on = orientation === o;
                  return (
                    <button
                      key={o}
                      ref={o === 'portrait' ? orientationRef : undefined}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setOrientation(o)}
                      style={{
                        flex: 1,
                        fontSize: 11.5,
                        fontWeight: 600,
                        padding: '6px 0',
                        borderRadius: 5,
                        border: 'none',
                        cursor: 'pointer',
                        background: on ? 'var(--ui-surface)' : 'transparent',
                        color: on ? 'var(--color-primary)' : 'var(--ui-text-dim)',
                        boxShadow: on ? '0 1px 2px rgba(0,0,0,.08)' : 'none',
                      }}
                    >
                      {o === 'portrait' ? 'Portrait' : 'Landscape'}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Paper size */}
            <div>
              <div style={{ ...SECTION_LABEL, marginBottom: 6 }}>Paper size</div>
              <Select
                ariaLabel="Paper size"
                variant="form"
                value={paperSize}
                onChange={(v) => setPaperSize(v as PageSetup['paperSize'])}
                options={paperOptions}
              />
            </div>

            {/* Margins */}
            <div>
              <div style={{ ...SECTION_LABEL, marginBottom: 6 }}>Margins</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {MARGIN_PRESET_ORDER.map((key) => {
                  const p = MARGIN_PRESETS[key];
                  const on = activePreset === key;
                  const px = (n: number) => Math.round(n * 96);
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => selectPreset(key)}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                        alignItems: 'flex-start',
                        padding: '7px 10px',
                        borderRadius: 8,
                        cursor: 'pointer',
                        textAlign: 'left',
                        border: on ? '1px solid var(--color-primary)' : '1px solid var(--ui-border-strong)',
                        background: on ? 'var(--ui-selected)' : 'var(--ui-surface)',
                      }}
                    >
                      <span style={{ fontSize: 11.5, fontWeight: 600, color: on ? 'var(--color-primary)' : 'var(--ui-text)' }}>
                        {key[0]!.toUpperCase() + key.slice(1)}
                      </span>
                      <span style={{ fontSize: 10, color: on ? 'var(--ui-teal-muted)' : 'var(--color-muted)' }}>
                        {`${px(p.top)}·${px(p.right)}·${px(p.bottom)}·${px(p.left)}px`}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginTop: 10 }}>
                {SIDES.map((s) => (
                  <NumberField
                    key={s}
                    label={s[0]!.toUpperCase() + s.slice(1)}
                    value={mStr[s]}
                    error={errorFor(s)}
                    onChange={(v) => setMStr((prev) => ({ ...prev, [s]: v }))}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Right — preview */}
          <div style={{ width: 240, background: 'var(--color-chrome)', padding: '18px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ ...SECTION_LABEL, alignSelf: 'stretch', marginBottom: 12 }}>Preview</div>
            <div
              style={{
                position: 'relative',
                width: mini.w,
                height: mini.h,
                background: 'var(--ui-surface)',
                border: '1px solid var(--ui-border-strong)',
                borderRadius: 3,
                boxShadow: '0 2px 6px rgba(31,41,51,.1)',
                transition: 'width 150ms ease, height 150ms ease',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  ...guide,
                  border: '1px dashed var(--ui-guide)',
                  transition: 'top 150ms ease, right 150ms ease, bottom 150ms ease, left 150ms ease',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3,
                  padding: 2,
                  overflow: 'hidden',
                }}
              >
                <div style={{ height: 3, width: '70%', background: 'var(--ui-skeleton-h)', borderRadius: 1 }} />
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} style={{ height: 2, width: i === 3 ? '55%' : '100%', background: 'var(--color-border)', borderRadius: 1 }} />
                ))}
              </div>
            </div>
            <div style={{ marginTop: 12, fontSize: 10.5, color: 'var(--color-muted)', textAlign: 'center', lineHeight: 1.5 }}>
              <div>{capA}</div>
              <div>{capB}</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, padding: '13px 20px', borderTop: '1px solid var(--ui-divider)', background: 'var(--color-chrome)', borderBottomLeftRadius: 12, borderBottomRightRadius: 12 }}>
          <button
            type="button"
            onClick={onClose}
            style={{ fontSize: 12, fontWeight: 600, color: 'var(--ui-text-soft)', background: 'var(--ui-surface)', border: '1px solid var(--ui-border-strong)', borderRadius: 7, padding: '7px 16px', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={commit}
            disabled={anyError}
            style={{ fontSize: 12, fontWeight: 600, color: '#fff', background: 'var(--color-primary)', border: '1px solid var(--color-primary)', borderRadius: 7, padding: '7px 18px', cursor: anyError ? 'not-allowed' : 'pointer', opacity: anyError ? 0.55 : 1 }}
          >
            OK
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function NumberField({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: boolean;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 10.5, color: error ? 'var(--ui-danger)' : 'var(--color-muted)' }}>{label}</span>
      <TextField
        inputMode="decimal"
        value={value}
        error={error}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
