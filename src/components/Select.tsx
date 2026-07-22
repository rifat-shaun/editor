import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { getPortalHost } from './portalHost';
import { useDismissable } from '../hooks/useDismissable';

/* ------------------------------------------------------------------ *
 * One shared Select for every dropdown-style field (toolbar + forms).
 * Two visual variants; portaled, flip-aware menu; searchable (auto when
 * ≥ 8 options); optional footer action; custom option/trigger rendering;
 * full keyboard + listbox a11y. Replaces all native <select> usages.
 * ------------------------------------------------------------------ */

export interface SelectOption {
  value: string;
  label: string; // used for the trigger text + typeahead
  hint?: string; // right-aligned muted hint (e.g. "metric")
  group?: string; // group label; consecutive same-group options are grouped
  disabled?: boolean;
}

export interface SelectProps {
  options: SelectOption[];
  value: string | null;
  onChange: (value: string) => void;
  ariaLabel: string;
  variant?: 'toolbar' | 'form';
  placeholder?: string;
  disabled?: boolean;
  /** Form-variant error helper text (also switches the trigger to the error state). */
  error?: string;
  /** Force the search header; otherwise it auto-shows when options ≥ 8. */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Action row shown after a divider at the bottom of the menu. */
  footerAction?: { label: string; onSelect: () => void };
  /** Custom row content (defaults to label + hint + ✓). */
  renderOption?: (opt: SelectOption, selected: boolean) => ReactNode;
  /** Custom trigger label (defaults to the selected option's label). */
  renderTriggerLabel?: (opt: SelectOption | null) => ReactNode;
  /** Editable trigger (e.g. font size): typing + Enter/blur commits a raw value;
   *  optional `onStep` handles ↑/↓ increment (kept out of the presets list). */
  editable?: { onCommit: (raw: string) => void; onStep?: (delta: number) => void };
  minWidth?: number;
  /** Extra classes on the trigger (layout only). */
  className?: string;
}

const COLORS = {
  text: 'var(--color-ink)',
  muted: 'var(--color-muted)',
  chevron: 'var(--color-muted)',
  chevronHover: 'var(--ui-text-soft)',
  primary: 'var(--color-primary)',
  halo: 'var(--color-primary-soft)',
  formBorder: 'var(--ui-border-strong)',
  formBorderHover: 'var(--ui-faint)',
  error: 'var(--ui-danger)',
  errorHalo: 'var(--ui-danger-bg)',
  disabledText: 'var(--ui-disabled)',
  disabledChevron: 'var(--ui-border-strong)',
  rowText: 'var(--ui-text)',
  rowHover: 'var(--ui-row-hover)',
  selBg: 'var(--ui-selected)',
  hint: 'var(--ui-disabled)',
  menuBorder: 'var(--color-border)',
  divider: 'var(--ui-hover)',
  groupLabel: 'var(--ui-faint)',
};

function Chevron({ open, color }: { open: boolean; color: string }) {
  return (
    <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path
        d={open ? 'M2 6.5L5 3.5L8 6.5' : 'M2 3.5L5 6.5L8 3.5'}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Select(props: SelectProps) {
  const {
    options,
    value,
    onChange,
    ariaLabel,
    variant = 'toolbar',
    placeholder = 'Select…',
    disabled = false,
    error,
    footerAction,
    renderOption,
    renderTriggerLabel,
    editable,
    minWidth,
    className = '',
  } = props;

  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [flipUp, setFlipUp] = useState(false);
  const [draft, setDraft] = useState('');
  const [id] = useState(() => `sel-${Math.random().toString(36).slice(2, 8)}`);

  const anchorRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | HTMLInputElement>(null);
  const menuRef = useDismissable<HTMLDivElement>(open, () => close(), { trapFocus: false });
  const searchRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

  const searchable = (props.searchable ?? options.length >= 8) && !editable;
  const selected = options.find((o) => o.value === value) ?? null;

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  function openMenu() {
    if (disabled) return;
    const r = anchorRef.current?.getBoundingClientRect();
    if (r) {
      setRect(r);
      setFlipUp(window.innerHeight - r.bottom < 260 && r.top > window.innerHeight - r.bottom);
    }
    const selIdx = Math.max(0, filtered.findIndex((o) => o.value === value));
    setActive(selIdx);
    setQuery('');
    setOpen(true);
  }
  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }
  function commit(opt: SelectOption) {
    if (opt.disabled) return;
    onChange(opt.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  // Keep the menu glued to the trigger while scrolling/resizing.
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

  // Focus the search box on open; keep the active row in view.
  useEffect(() => {
    if (open && searchable) searchRef.current?.focus();
  }, [open, searchable]);
  useEffect(() => {
    if (open) rowRefs.current[active]?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const typeahead = useRef({ buf: '', t: 0 });
  const suppressBlur = useRef(false); // skip the commit-on-blur after Enter/Esc
  function onListKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = filtered[active];
      if (opt) commit(opt);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (!searchable && e.key.length === 1 && /\S/.test(e.key)) {
      // typeahead on the (unsearchable) list
      const now = Date.now();
      const ta = typeahead.current;
      ta.buf = now - ta.t < 700 ? ta.buf + e.key : e.key;
      ta.t = now;
      const idx = filtered.findIndex((o) => o.label.toLowerCase().startsWith(ta.buf.toLowerCase()));
      if (idx >= 0) setActive(idx);
    }
  }

  function onTriggerKeyDown(e: KeyboardEvent) {
    if (editable) {
      if (e.key === 'Enter') {
        e.preventDefault();
        suppressBlur.current = true; // the editor-refocus blur must not re-commit
        editable.onCommit(draft);
        setDraft('');
        setOpen(false);
      } else if (e.key === 'Escape') {
        // Revert to the current value without applying.
        e.preventDefault();
        suppressBlur.current = true;
        setDraft('');
        triggerRef.current?.blur();
      } else if (e.key === 'ArrowDown' && e.altKey) {
        e.preventDefault();
        openMenu(); // discovery path: Alt+↓ (or the chevron) opens the presets
      } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && editable.onStep) {
        // Stepper: ↑/↓ increment the applied size by ±1 (keeps input focus).
        e.preventDefault();
        setDraft('');
        editable.onStep(e.key === 'ArrowUp' ? 1 : -1);
      }
      return;
    }
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault();
      openMenu();
    }
  }

  /* ------------------------------- trigger ------------------------------- */

  const isError = variant === 'form' && !!error;
  const showBorder = variant === 'form' || open;
  const borderColor = disabled
    ? 'transparent'
    : isError
      ? COLORS.error
      : open
        ? COLORS.primary
        : variant === 'form'
          ? hover
            ? COLORS.formBorderHover
            : COLORS.formBorder
          : 'transparent';
  const halo = open
    ? isError
      ? COLORS.errorHalo
      : COLORS.halo
    : null;
  const chevronColor = disabled
    ? COLORS.disabledChevron
    : open
      ? COLORS.primary
      : hover
        ? COLORS.chevronHover
        : COLORS.chevron;

  const triggerStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    width: '100%',
    boxSizing: 'border-box',
    height: variant === 'toolbar' ? 28 : undefined,
    padding: variant === 'toolbar' ? '5px 9px' : '8px 12px',
    borderRadius: variant === 'toolbar' ? 6 : 7,
    border: `1.5px solid ${showBorder ? borderColor : 'transparent'}`,
    boxShadow: halo ? `0 0 0 3px ${halo}` : 'none',
    background: disabled ? 'transparent' : open ? 'var(--ui-surface)' : hover && !disabled ? 'var(--ui-hover)' : variant === 'form' ? 'var(--ui-surface)' : 'transparent',
    fontSize: 12.5,
    color: disabled ? COLORS.disabledText : COLORS.text,
    cursor: disabled ? 'default' : 'pointer',
    textAlign: 'left',
    outline: 'none',
    transition: 'background-color .1s ease, box-shadow .1s ease, border-color .1s ease',
  };

  const labelNode = renderTriggerLabel
    ? renderTriggerLabel(selected)
    : selected
      ? selected.label
      : <span style={{ color: COLORS.muted }}>{placeholder}</span>;

  return (
    <div ref={anchorRef} style={{ position: 'relative', display: 'inline-flex', width: variant === 'form' ? '100%' : undefined }} className={className}>
      {editable ? (
        <span style={triggerStyle} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
          <input
            ref={triggerRef as React.Ref<HTMLInputElement>}
            aria-label={ariaLabel}
            role="combobox"
            aria-expanded={open}
            aria-controls={id}
            disabled={disabled}
            value={open || draft !== '' ? draft : selected?.label ?? value ?? ''}
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ''))}
            onFocus={(e) => {
              setDraft(selected?.label ?? value ?? '');
              e.currentTarget.select(); // select-all so typing overwrites cleanly
            }}
            onBlur={() => {
              if (suppressBlur.current) {
                suppressBlur.current = false; // Enter/Esc already handled it
              } else if (draft) {
                editable.onCommit(draft); // commit-on-blur (invalid input is clamped/reverted by the caller)
              }
              setDraft(''); // fall back to the reactive value (e.g. shows the clamped size)
            }}
            onKeyDown={onTriggerKeyDown}
            style={{ width: 26, border: 'none', outline: 'none', background: 'transparent', font: 'inherit', color: 'inherit', padding: 0, textAlign: 'center' }}
          />
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            disabled={disabled}
            // Don't steal focus when just opening via the chevron (keeps the
            // editor selection active/visible). The input still focuses on a
            // direct click because it has no preventDefault.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => (open ? setOpen(false) : openMenu())}
            style={{ display: 'inline-flex', border: 'none', background: 'transparent', padding: 0, cursor: 'inherit' }}
          >
            <Chevron open={open} color={chevronColor} />
          </button>
        </span>
      ) : (
        <button
          ref={triggerRef as React.Ref<HTMLButtonElement>}
          type="button"
          role="combobox"
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={id}
          disabled={disabled}
          // Focus-safe: don't blur the editor's contenteditable when opening, so
          // the current text selection stays active and visible (Approach A).
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => (open ? setOpen(false) : openMenu())}
          onKeyDown={onTriggerKeyDown}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          style={triggerStyle}
        >
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{labelNode}</span>
          <Chevron open={open} color={chevronColor} />
        </button>
      )}

      {isError && (
        <span style={{ position: 'absolute', top: '100%', left: 2, marginTop: 3, fontSize: 10.5, color: COLORS.error }}>
          {error}
        </span>
      )}

      {open && rect &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[89]" aria-hidden="true" onClick={() => setOpen(false)} />
            <div
              ref={menuRef}
              id={id}
              role="listbox"
              aria-label={ariaLabel}
              aria-activedescendant={filtered[active] ? `${id}-opt-${active}` : undefined}
              onKeyDown={onListKeyDown}
              tabIndex={-1}
              style={{
                position: 'fixed',
                left: Math.round(Math.min(rect.left, window.innerWidth - (minWidth ?? rect.width) - 8)),
                [flipUp ? 'bottom' : 'top']: flipUp
                  ? Math.round(window.innerHeight - rect.top + 4)
                  : Math.round(rect.bottom + 4),
                // Above modal scrims (dialogs use z-70/80) so Selects inside a
                // dialog remain clickable.
                zIndex: 90,
                minWidth: Math.round(minWidth ?? rect.width),
                maxHeight: 320,
                overflowY: 'auto',
                background: 'var(--ui-surface)',
                border: `1px solid ${COLORS.menuBorder}`,
                borderRadius: 9,
                boxShadow: '0 10px 32px rgba(31,41,51,.18)',
                padding: 5,
              } as CSSProperties}
            >
              {searchable && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px 8px', borderBottom: `1px solid ${COLORS.divider}`, marginBottom: 4 }}>
                  <span aria-hidden="true" style={{ color: COLORS.muted, fontSize: 12 }}>🔍</span>
                  <input
                    ref={searchRef}
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setActive(0); }}
                    onKeyDown={onListKeyDown}
                    placeholder={props.searchPlaceholder ?? 'Search…'}
                    style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 12, color: COLORS.text }}
                  />
                </div>
              )}

              {filtered.map((opt, i) => {
                const isSel = opt.value === value;
                const isActive = i === active;
                const prev = filtered[i - 1];
                const groupChanged = opt.group && opt.group !== prev?.group;
                return (
                  <div key={opt.value}>
                    {groupChanged && (
                      <>
                        {i > 0 && <div style={{ height: 1, background: COLORS.divider, margin: '4px 6px' }} />}
                        <div style={{ padding: '3px 10px', fontSize: 10, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase', color: COLORS.groupLabel }}>
                          {opt.group}
                        </div>
                      </>
                    )}
                    <div
                      ref={(el) => (rowRefs.current[i] = el)}
                      id={`${id}-opt-${i}`}
                      role="option"
                      aria-selected={isSel}
                      onMouseEnter={() => setActive(i)}
                      onMouseDown={(e) => { e.preventDefault(); commit(opt); }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '7px 10px',
                        borderRadius: 6,
                        fontSize: 12.5,
                        cursor: opt.disabled ? 'default' : 'pointer',
                        color: opt.disabled ? COLORS.disabledText : isSel ? COLORS.text : COLORS.rowText,
                        fontWeight: isSel ? 600 : 400,
                        background: isSel ? COLORS.selBg : isActive ? COLORS.rowHover : 'transparent',
                      }}
                    >
                      <span style={{ flex: 1, minWidth: 0 }}>{renderOption ? renderOption(opt, isSel) : opt.label}</span>
                      {opt.hint && <span style={{ fontSize: 10, color: COLORS.hint }}>{opt.hint}</span>}
                      {isSel && <span style={{ color: COLORS.primary, fontWeight: 700 }} aria-hidden="true">✓</span>}
                    </div>
                  </div>
                );
              })}

              {filtered.length === 0 && (
                <div style={{ padding: '7px 10px', fontSize: 12, color: COLORS.muted }}>No matches</div>
              )}

              {footerAction && (
                <>
                  <div style={{ height: 1, background: COLORS.divider, margin: '4px 6px' }} />
                  <div
                    role="option"
                    aria-selected={false}
                    onMouseDown={(e) => { e.preventDefault(); footerAction.onSelect(); setOpen(false); }}
                    style={{ padding: '7px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, color: COLORS.primary, cursor: 'pointer' }}
                  >
                    {footerAction.label}
                  </div>
                </>
              )}
            </div>
          </>,
          getPortalHost(),
        )}
    </div>
  );
}
