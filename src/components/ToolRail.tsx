import { useEffect, useState } from 'react';
import { useEditorState } from '../editor/context';
import { Icon, type IconName } from './icons';
import { PageSetupPanel } from './PageSetupPanel';
import { ExportPanelBody } from './ExportPanel';

type PanelKey = 'pageSetup' | 'comments' | 'find' | 'history' | 'export' | 'share';

interface RailItem {
  key: PanelKey;
  icon: IconName;
  label: string;
}

const ITEMS: RailItem[] = [
  { key: 'pageSetup', icon: 'pageSetup', label: 'Page setup' },
  { key: 'comments', icon: 'comment', label: 'Comments' },
  { key: 'find', icon: 'find', label: 'Find & replace' },
  { key: 'history', icon: 'history', label: 'Version history' },
  { key: 'export', icon: 'exportIcon', label: 'Export' },
  { key: 'share', icon: 'share', label: 'Share' },
];

export function ToolRail() {
  const { editor } = useEditorState();
  const [active, setActive] = useState<PanelKey | null>(null);

  // Escape closes the open panel.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActive(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [active]);

  return (
    <div className="print-hide flex shrink-0">
      {active && (
        <section
          role="region"
          aria-label={ITEMS.find((i) => i.key === active)?.label}
          className="flex w-[300px] shrink-0 flex-col border-l border-border bg-[var(--ui-surface)]"
        >
          <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
            <span className="text-[13px] font-semibold text-ink">
              {ITEMS.find((i) => i.key === active)?.label}
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
            {active === 'find' && (
              <input
                type="text"
                placeholder="Find in document…"
                className="w-full rounded-md border border-border px-2.5 py-1.5 text-[13px] outline-none focus:border-primary-border"
              />
            )}
            {active === 'share' && (
              <p className="text-[12px] text-muted">Use the Share button in the top bar.</p>
            )}
          </div>
          )}
        </section>
      )}

      <div className="flex w-[46px] shrink-0 flex-col items-center gap-1 border-l border-border bg-panel py-2">
        {ITEMS.map((it) => {
          const IconCmp = Icon[it.icon];
          const isActive = active === it.key;
          return (
            <button
              key={it.key}
              type="button"
              title={it.label}
              aria-label={it.label}
              aria-expanded={isActive}
              onClick={() => setActive((cur) => (cur === it.key ? null : it.key))}
              className={[
                'flex h-9 w-9 items-center justify-center rounded-md transition-colors',
                isActive ? 'bg-primary-soft text-primary' : 'text-muted hover:bg-[var(--ui-hover)] hover:text-ui',
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
