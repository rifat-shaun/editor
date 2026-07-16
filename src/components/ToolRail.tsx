import { useEffect, useState } from 'react';
import { useEditorState } from '../editor/context';
import type { Margins, PageFormatName } from '../editor/pagination/config';
import { PAGE_FORMATS } from '../editor/pagination/config';
import { Icon, type IconName } from './icons';
import { Segmented } from './primitives';

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

// Predefined margin presets (CSS px). Mirrors a word-processor's margin menu.
const MARGIN_PRESETS: Record<string, Margins> = {
  Normal: { top: 96, right: 96, bottom: 96, left: 96 },
  Narrow: { top: 48, right: 48, bottom: 48, left: 48 },
  Moderate: { top: 96, right: 72, bottom: 96, left: 72 },
  Wide: { top: 96, right: 144, bottom: 96, left: 144 },
};

const FORMAT_LABEL: Record<PageFormatName, string> = {
  Letter: 'Letter · 8.5×11″',
  A4: 'A4 · 210×297mm',
  Legal: 'Legal · 8.5×14″',
};

export function ToolRail() {
  const { editor, ai } = useEditorState();
  const [active, setActive] = useState<PanelKey | null>(null);
  // Local UI state mirrors the values the editor was configured with.
  const [format, setFormat] = useState<PageFormatName>('Letter');
  const [marginKey, setMarginKey] = useState<string>('Normal');

  const aiActive = ai.phase === 'reviewing' || ai.phase === 'generating';

  // Escape closes the open panel.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActive(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [active]);

  const applyFormat = (f: PageFormatName) => {
    setFormat(f);
    editor?.commands.setPageFormat(f);
  };
  const applyMargin = (k: string) => {
    setMarginKey(k);
    editor?.commands.updateMargins(MARGIN_PRESETS[k]!);
  };

  return (
    <div className="flex shrink-0">
      {active && (
        <section
          role="region"
          aria-label={ITEMS.find((i) => i.key === active)?.label}
          className="flex w-[300px] shrink-0 flex-col border-l border-border bg-white"
        >
          <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
            <span className="text-[13px] font-semibold text-ink">
              {ITEMS.find((i) => i.key === active)?.label}
            </span>
            <button
              type="button"
              onClick={() => setActive(null)}
              aria-label="Close panel"
              className="flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-[#eef1f3]"
            >
              <Icon.x size={15} />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto p-3 docs-scroll">
            {active === 'pageSetup' && (
              <div className="flex flex-col gap-4">
                <div>
                  <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-muted">
                    Page format
                  </p>
                  <Segmented<PageFormatName>
                    label="Page format"
                    value={format}
                    onChange={applyFormat}
                    options={[
                      { value: 'Letter', label: 'Letter' },
                      { value: 'A4', label: 'A4' },
                      { value: 'Legal', label: 'Legal' },
                    ]}
                  />
                  <p className="mt-1.5 text-[11px] text-muted">
                    {FORMAT_LABEL[format]} · {PAGE_FORMATS[format].width}×{PAGE_FORMATS[format].height}
                    px
                  </p>
                </div>

                <div>
                  <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-muted">
                    Margins
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {Object.keys(MARGIN_PRESETS).map((k) => {
                      const m = MARGIN_PRESETS[k]!;
                      const activePreset = marginKey === k;
                      return (
                        <button
                          key={k}
                          type="button"
                          aria-pressed={activePreset}
                          onClick={() => applyMargin(k)}
                          className={[
                            'rounded-md border px-2 py-2 text-left transition-colors',
                            activePreset
                              ? 'border-primary-border bg-primary-soft'
                              : 'border-border hover:bg-[#eef1f3]',
                          ].join(' ')}
                        >
                          <span
                            className={[
                              'block text-[12px] font-semibold',
                              activePreset ? 'text-primary' : 'text-ui',
                            ].join(' ')}
                          >
                            {k}
                          </span>
                          <span className="text-[10.5px] text-muted">
                            {m.top}·{m.right}·{m.bottom}·{m.left}px
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {active === 'history' && (
              <div className="flex flex-col gap-1.5">
                {ai.versions.length === 0 ? (
                  <p className="text-[12px] text-muted">No versions yet.</p>
                ) : (
                  ai.versions.map((v) => (
                    <div key={v.id} className="rounded-md border border-border p-2.5">
                      <p className="text-[12px] font-medium text-ink">{v.label}</p>
                      <p className="text-[11px] text-muted">
                        {v.summary.accepted} accepted · {v.summary.rejected} rejected
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}

            {active === 'export' && (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="rounded-md bg-primary px-3 py-2 text-[12px] font-semibold text-white hover:brightness-110"
                >
                  Print…
                </button>
                <p className="text-[11px] leading-snug text-muted">
                  Native print uses the browser's own pagination and may differ from the on-screen
                  page breaks.
                </p>
              </div>
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
        </section>
      )}

      <div className="flex w-[46px] shrink-0 flex-col items-center gap-1 border-l border-border bg-panel py-2">
        <button
          type="button"
          title="AI edits"
          aria-label="AI edits"
          onClick={() => (ai.phase === 'idle' ? ai.openPrompt() : ai.focusNext())}
          className="group relative mb-1 flex h-9 w-9 items-center justify-center rounded-full transition-colors"
          style={
            aiActive
              ? { background: '#0e7490', color: '#fff', boxShadow: '0 0 0 3px #d4f2f7' }
              : { color: '#8a939b' }
          }
        >
          <Icon.sparkle size={18} />
          {ai.counts.pending > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-warn px-1 text-[9px] font-bold text-white">
              {ai.counts.pending}
            </span>
          )}
        </button>

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
                isActive ? 'bg-primary-soft text-primary' : 'text-muted hover:bg-[#e9edee] hover:text-ui',
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
