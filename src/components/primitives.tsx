import {
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { getPortalHost } from './portalHost';
import { useDismissable } from '../hooks/useDismissable';
import { Icon } from './icons';

/** A chrome button used across the toolbar and top bar. */
export function ToolButton({
  active,
  label,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; label: string }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={[
        'inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-[5px] px-1.5',
        'text-[12px] text-ui transition-colors',
        active ? 'bg-primary-soft text-primary' : 'hover:bg-[var(--ui-hover)]',
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}

export function ToolbarDivider() {
  return <span aria-hidden="true" className="mx-1 h-[18px] w-px shrink-0 bg-[var(--color-border)]" />;
}

/**
 * Accessible dropdown menu anchored to a trigger. The panel is portaled to
 * `document.body` with fixed positioning so it escapes any `overflow` clipping
 * ancestor (e.g. the responsive toolbar). A transparent backdrop closes it on
 * outside click and prevents the trigger from immediately re-toggling.
 */
export function Menu({
  trigger,
  children,
  align = 'left',
  panelClassName = '',
}: {
  trigger: (props: { open: boolean; toggle: () => void; id: string }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'left' | 'right';
  panelClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [id] = useState(() => `menu-${Math.random().toString(36).slice(2, 8)}`);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const ref = useDismissable<HTMLDivElement>(open, () => setOpen(false), { trapFocus: true });

  const openMenu = () => {
    const r = anchorRef.current?.getBoundingClientRect();
    if (r) setRect(r);
    setOpen(true);
  };
  const toggle = () => (open ? setOpen(false) : openMenu());

  // Keep the panel glued to the trigger while scrolling/resizing.
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

  const panelStyle: CSSProperties = rect
    ? {
        position: 'fixed',
        top: Math.round(rect.bottom + 4),
        ...(align === 'right'
          ? { right: Math.round(window.innerWidth - rect.right) }
          : { left: Math.round(rect.left) }),
      }
    : {};

  return (
    <>
      <span ref={anchorRef} className="inline-flex">
        {trigger({ open, toggle, id })}
      </span>
      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[55]" onClick={() => setOpen(false)} aria-hidden="true" />
            <div
              ref={ref}
              id={id}
              role="menu"
              style={panelStyle}
              className={[
                'z-[60] max-h-[70vh] min-w-[220px] overflow-y-auto rounded-lg border border-border bg-[var(--ui-surface)] p-1 shadow-lg docs-scroll',
                panelClassName,
              ].join(' ')}
            >
              {children(() => setOpen(false))}
            </div>
          </>,
          getPortalHost(),
        )}
    </>
  );
}

export function MenuItem({
  children,
  onSelect,
  icon,
  shortcut,
}: {
  children: ReactNode;
  onSelect: () => void;
  icon?: ReactNode;
  shortcut?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12.5px] text-ui hover:bg-[var(--ui-hover)]"
    >
      {icon && <span className="text-muted">{icon}</span>}
      <span className="flex-1">{children}</span>
      {shortcut && <span className="text-[11px] text-muted">{shortcut}</span>}
    </button>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
      {children}
    </div>
  );
}

/** Segmented control (e.g. scope picker). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange(value: T): void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-md border border-border bg-panel p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={[
            'rounded-[5px] px-2.5 py-1 text-[11.5px] font-medium transition-colors',
            value === o.value ? 'bg-[var(--ui-surface)] text-primary shadow-sm' : 'text-ui hover:text-ink',
          ].join(' ')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export { Icon };
