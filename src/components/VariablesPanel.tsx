import { useMemo, useState } from 'react';
import { useVariables } from '../editor/variablesContext';
import { resolveVariable, VARIABLE_DRAG_MIME } from '../editor/extensions/variable';
import { TextField } from './TextField';
import { Highlighted } from './Highlighted';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/**
 * Build a small off-screen chip to use as the drag image (value, or the
 * `{{technical_name}}` chip when unset). It's appended to <body> so the browser
 * can snapshot it, then removed on the next tick.
 */
function makeDragGhost(text: string, unset: boolean): HTMLElement {
  const el = document.createElement('span');
  el.textContent = text;
  Object.assign(el.style, {
    position: 'fixed',
    top: '-1000px',
    left: '0',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '13px',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    color: '#0e7490',
    fontFamily: unset ? MONO : 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    background: unset ? '#f2fcfd' : '#eaf7fa',
    border: unset ? '1px dashed #7ecfdd' : '1px solid #bfe6ee',
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 0);
  return el;
}

/**
 * Right-rail "Variables" panel: a searchable list of the consumer's variables
 * with their current value (or italic "unset"). Read-only — a live view of
 * `variableList` + `variableValues`. Reactive: values update as the consumer
 * changes them.
 */
export function VariablesPanel() {
  const { catalog, values } = useVariables();
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? catalog.filter((d) => d.label.toLowerCase().includes(q) || d.name.toLowerCase().includes(q))
      : catalog;
    return list.map((d) => ({ def: d, ...resolveVariable(values, d.name) }));
  }, [catalog, values, query]);

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 p-3 pb-2">
        <TextField
          type="search"
          aria-label="Search variables"
          placeholder="Search variables…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-2 docs-scroll">
        {rows.length === 0 ? (
          <p className="px-2 py-2 text-[12px] text-muted">No matching variables</p>
        ) : (
          rows.map(({ def, unset, value }) => (
            <div
              key={def.name}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(VARIABLE_DRAG_MIME, def.name);
                e.dataTransfer.setData('text/plain', unset ? `{{${def.name}}}` : (value ?? ''));
                e.dataTransfer.effectAllowed = 'copy';
                // Custom drag preview: the value if set, else {{technical_name}}
                // — not the full row card.
                e.dataTransfer.setDragImage(makeDragGhost(unset ? `{{${def.name}}}` : (value ?? ''), unset), 12, 12);
              }}
              title="Drag into the document to insert"
              className="flex cursor-grab items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-[var(--ui-hover)] active:cursor-grabbing"
            >
              {/* Left: label above, {{ technical_name }} on its own line below. */}
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-[12.5px] font-semibold text-ink" title={def.label}>
                  <Highlighted text={def.label} query={query.trim()} />
                </span>
                <span className="truncate text-[11px] text-primary" style={{ fontFamily: MONO }}>
                  {'{{'}
                  <Highlighted text={def.name} query={query.trim()} />
                  {'}}'}
                </span>
              </span>
              {/* Right: current value (ellipsized) or italic "unset". */}
              <span
                className={[
                  'shrink-0 truncate text-right text-[12px]',
                  unset ? 'italic text-[var(--ui-faint)]' : 'text-[var(--ui-text-dim)]',
                ].join(' ')}
                style={{ maxWidth: 140 }}
                title={unset ? undefined : (value ?? undefined)}
              >
                {unset ? 'unset' : value}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
