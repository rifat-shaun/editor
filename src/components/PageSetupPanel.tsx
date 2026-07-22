/**
 * Page setup — SIDEBAR variant (ToolRail). Same control design as the modal
 * (design 20b) but laid out vertically for the narrow rail, with the live
 * preview on TOP instead of aside. Applies live via `setPageSetup` (the same
 * undoable doc-attr path as the modal); the modal itself is untouched.
 */
import { useMemo, useState, type CSSProperties } from 'react';
import type { Editor } from '@tiptap/core';
import { Select } from './Select';
import { TextField } from './TextField';
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
} from '../menus/pageSetup';

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
const SIDES: Side[] = ['top', 'bottom', 'left', 'right'];

function marginStrings(m: PageSetup['margins']): Record<Side, string> {
  return { top: m.top.toFixed(1), right: m.right.toFixed(1), bottom: m.bottom.toFixed(1), left: m.left.toFixed(1) };
}

function normalize(s: PageSetup): PageSetup {
  return { ...s, marginPreset: matchMarginPreset(s.margins) };
}

export function PageSetupPanel({ editor }: { editor: Editor }) {
  const initial = (editor.state.doc.attrs.pageSetup as PageSetup | null) ?? DEFAULT_PAGE_SETUP;
  // The last-applied setup; edits build a DRAFT and only commit on Apply.
  const [committed, setCommitted] = useState<PageSetup>(normalize(initial));
  const [orientation, setOrientation] = useState(initial.orientation);
  const [paperSize, setPaperSize] = useState(initial.paperSize);
  const [mStr, setMStr] = useState<Record<Side, string>>(marginStrings(initial.margins));

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

  const errorFor = (s: Side) => {
    const v = nums[s];
    return !Number.isFinite(v) || v < MIN_MARGIN_IN || v > maxMargin(draft, s);
  };
  const anyError = SIDES.some(errorFor);
  const activePreset = matchMarginPreset(draft.margins);

  // Draft vs applied: Apply commits, Cancel reverts. Nothing touches the editor
  // until Apply.
  const dirty = JSON.stringify(normalize(draft)) !== JSON.stringify(committed);

  const apply = () => {
    if (anyError || !dirty) return;
    const setup = normalize(draft);
    editor.commands.setPageSetup(setup);
    setCommitted(setup);
  };
  const cancel = () => {
    setOrientation(committed.orientation);
    setPaperSize(committed.paperSize);
    setMStr(marginStrings(committed.margins));
  };

  const selectPreset = (key: MarginPresetKey) => setMStr(marginStrings(MARGIN_PRESETS[key]));

  const mini = orientation === 'landscape' ? { w: 104, h: 80 } : { w: 80, h: 104 };
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

  return (
    <div className="flex min-h-0 flex-1 flex-col" style={{ fontFamily: FONT, color: 'var(--ui-text)' }}>
      <div className="flex-1 overflow-y-auto p-3 docs-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Preview — on top */}
      <div>
        <div style={{ ...SECTION_LABEL, marginBottom: 10 }}>Preview</div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '4px 0 12px', background: 'var(--color-chrome)', borderRadius: 8, border: '1px solid var(--ui-divider)' }}>
          <div
            style={{
              position: 'relative',
              width: mini.w,
              height: mini.h,
              marginTop: 12,
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
                gap: 2,
                padding: 2,
                overflow: 'hidden',
              }}
            >
              <div style={{ height: 2.5, width: '70%', background: 'var(--ui-skeleton-h)', borderRadius: 1 }} />
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ height: 2, width: i === 2 ? '55%' : '100%', background: 'var(--color-border)', borderRadius: 1 }} />
              ))}
            </div>
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--color-muted)', textAlign: 'center', lineHeight: 1.5 }}>
            <div>{capA}</div>
            <div>{capB}</div>
          </div>
        </div>
      </div>

      {/* Orientation */}
      <div>
        <div style={{ ...SECTION_LABEL, marginBottom: 6 }}>Orientation</div>
        <div style={{ display: 'flex', background: 'var(--ui-hover)', borderRadius: 7, padding: 2 }} role="radiogroup" aria-label="Orientation">
          {(['portrait', 'landscape'] as const).map((o) => {
            const on = orientation === o;
            return (
              <button
                key={o}
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
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 6 }}>
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

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 7, marginTop: 10 }}>
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

      {/* Footer — fixed at the panel bottom; commit / discard the draft. */}
      <div
        className="shrink-0"
        style={{
          padding: '11px 12px',
          background: 'var(--color-chrome)',
          borderTop: '1px solid var(--ui-divider)',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
        }}
      >
        <button
          type="button"
          onClick={cancel}
          disabled={!dirty}
          style={{ fontSize: 12, fontWeight: 600, color: 'var(--ui-text-soft)', background: 'var(--ui-surface)', border: '1px solid var(--ui-border-strong)', borderRadius: 7, padding: '7px 14px', cursor: dirty ? 'pointer' : 'not-allowed', opacity: dirty ? 1 : 0.55 }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={apply}
          disabled={!dirty || anyError}
          style={{ fontSize: 12, fontWeight: 600, color: '#fff', background: 'var(--color-primary)', border: '1px solid var(--color-primary)', borderRadius: 7, padding: '7px 18px', cursor: !dirty || anyError ? 'not-allowed' : 'pointer', opacity: !dirty || anyError ? 0.55 : 1 }}
        >
          Apply
        </button>
      </div>
    </div>
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
