import { useEffect, useRef } from 'react';

/**
 * Dismiss a popover/menu on Escape or an outside click, and focus-trap Tab
 * within it while open. Returns a ref to attach to the container element.
 */
export function useDismissable<T extends HTMLElement>(
  open: boolean,
  onDismiss: () => void,
  opts: { trapFocus?: boolean } = {},
) {
  const ref = useRef<T>(null);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!open) return;
    const el = ref.current;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onDismissRef.current();
        return;
      }
      if (opts.trapFocus && e.key === 'Tab' && el) {
        const focusables = el.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
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

    const onPointer = (e: PointerEvent) => {
      const target = e.target as Element | null;
      // A Select/menu opened from inside this popover portals its options to
      // document.body (outside `el`); don't treat clicking them as "outside".
      if (target?.closest?.('[role="listbox"]')) return;
      if (el && !el.contains(target as Node)) onDismissRef.current();
    };

    document.addEventListener('keydown', onKey, true);
    // Defer pointer listener so the opening click doesn't immediately close it.
    const t = setTimeout(() => document.addEventListener('pointerdown', onPointer, true), 0);

    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPointer, true);
      clearTimeout(t);
    };
  }, [open, opts.trapFocus]);

  // Autofocus the first focusable when opening.
  useEffect(() => {
    if (open && opts.trapFocus && ref.current) {
      const first = ref.current.querySelector<HTMLElement>(
        'input, textarea, button, [tabindex]:not([tabindex="-1"])',
      );
      first?.focus();
    }
  }, [open, opts.trapFocus]);

  return ref;
}
