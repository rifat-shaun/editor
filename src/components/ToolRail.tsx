import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEditorState } from '../editor/context';
import { useVariables } from '../editor/variablesContext';
import { Icon, type IconName } from './icons';
import { PageSetupPanel } from './PageSetupPanel';
import { ExportPanelBody } from './ExportPanel';
import { VariablesPanel } from './VariablesPanel';
import { FindPanel } from './FindPanel';

type PanelKey = 'pageSetup' | 'variables' | 'comments' | 'find' | 'history' | 'export' | 'share';

interface RailItem {
  key: PanelKey;
  icon: IconName;
  label: string;
  /** Panel that performs edits → disabled in view mode. */
  edits?: boolean;
}

const ITEMS: RailItem[] = [
  { key: 'pageSetup', icon: 'pageSetup', label: 'Page setup', edits: true },
  { key: 'variables', icon: 'variable', label: 'Variables' },
  { key: 'comments', icon: 'comment', label: 'Comments' },
  { key: 'find', icon: 'find', label: 'Find & replace' },
  { key: 'history', icon: 'history', label: 'Version history' },
  { key: 'export', icon: 'exportIcon', label: 'Export' },
  { key: 'share', icon: 'share', label: 'Share' },
];

export function ToolRail() {
  const { editor, mode } = useEditorState();
  const { catalog } = useVariables();
  const viewing = mode === 'viewing';
  const [active, setActive] = useState<PanelKey | null>(null);
  const reduce = useReducedMotion();
  // Width wipe for the panel: it's in-flow, so animating width smoothly pushes
  // the editor. Content lives in a fixed-width inner box clipped by the
  // overflow-hidden panel. Keyed by presence (not by which panel), so switching
  // panels while open swaps content without re-running the width animation.
  const panelTransition = { duration: reduce ? 0 : 0.24, ease: [0.16, 1, 0.3, 1] as const };

  // Close an edit-only panel (e.g. Page setup) when switching to view mode.
  useEffect(() => {
    if (viewing && active && ITEMS.find((i) => i.key === active)?.edits) setActive(null);
  }, [viewing, active]);

  // Escape closes the open panel.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActive(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [active]);

  // Open Find & replace via ⌘F/Ctrl+F (overriding the browser find while the
  // editor is mounted) or the Edit → Find & replace menu (`docs:open-find`).
  useEffect(() => {
    const openFind = () => setActive('find');
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        openFind();
      }
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('docs:open-find', openFind as EventListener);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('docs:open-find', openFind as EventListener);
    };
  }, []);

  return (
    <div className="print-hide flex shrink-0">
      <AnimatePresence initial={false}>
        {active && (
          <motion.section
            key="railpanel"
            role="region"
            aria-label={ITEMS.find((i) => i.key === active)?.label}
            className="shrink-0 overflow-hidden border-l border-border bg-[var(--ui-surface)]"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 300, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={panelTransition}
          >
            <div className="flex h-full w-[300px] flex-col">
          <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
            <span className="flex items-center gap-2 text-[13px] font-semibold text-ink">
              {ITEMS.find((i) => i.key === active)?.label}
              {active === 'variables' && catalog.length > 0 && (
                <span className="rounded-full bg-primary-soft px-1.5 text-[11px] font-semibold text-primary">
                  {catalog.length}
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() => setActive(null)}
              aria-label="Close panel"
              className="flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-[var(--ui-hover)]"
            >
              <Icon.x size={15} />
            </button>
          </header>

          {active === 'pageSetup' && editor ? (
            // Owns the full panel height: scrollable body + a fixed footer.
            <PageSetupPanel editor={editor} />
          ) : active === 'export' && editor ? (
            // Owns the full panel height: scrollable body + a fixed footer.
            <ExportPanelBody />
          ) : active === 'variables' ? (
            // Owns the full panel height: search + scrollable list.
            <VariablesPanel />
          ) : active === 'find' ? (
            // Owns the full panel height: fields + results + footer.
            <FindPanel onClose={() => setActive(null)} />
          ) : (
          <div className="flex-1 overflow-y-auto p-3 docs-scroll">
            {active === 'history' && (
              <p className="text-[12px] text-muted">No versions yet.</p>
            )}

            {active === 'comments' && (
              <p className="text-[12px] text-muted">
                Open comments appear beside the document. No unresolved comments right now.
              </p>
            )}
            {active === 'share' && (
              <p className="text-[12px] text-muted">Use the Share button in the top bar.</p>
            )}
          </div>
          )}
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <div className="flex w-[46px] shrink-0 flex-col items-center gap-1 border-l border-border bg-panel py-2">
        {ITEMS.map((it) => {
          const IconCmp = Icon[it.icon];
          const isActive = active === it.key;
          const disabled = viewing && !!it.edits; // no page-geometry edits in view mode
          return (
            <button
              key={it.key}
              type="button"
              title={disabled ? `${it.label} (view mode)` : it.label}
              aria-label={it.label}
              aria-expanded={isActive}
              disabled={disabled}
              onClick={() => setActive((cur) => (cur === it.key ? null : it.key))}
              className={[
                'flex h-9 w-9 items-center justify-center rounded-md transition-colors',
                disabled
                  ? 'cursor-not-allowed text-[var(--ui-disabled)]'
                  : isActive
                    ? 'bg-primary-soft text-primary'
                    : 'text-muted hover:bg-[var(--ui-hover)] hover:text-ui',
              ].join(' ')}
            >
              <IconCmp size={18} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
