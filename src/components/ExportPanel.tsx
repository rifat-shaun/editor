/**
 * Export panel body (design 25a). Renders inside the ToolRail's Export panel —
 * which owns the 300px shell, the "Export" header and the close button — so this
 * component provides just the scrollable body (format picker + file name) plus a
 * fixed footer with the download button. Mounts fresh each time the panel opens.
 *
 * Formats → PDF (browser print dialog → Save as PDF), DOCX (docx-js), Markdown
 * (serializer), Plain text (baked), JSON (canonical, re-importable). Variables
 * bake to their resolved value on export (except JSON, which keeps references);
 * the unset-variables toggle governs whether unset ones are included.
 */
import { useMemo, useState, type CSSProperties } from 'react';
import { useEditorState } from '../editor/context';
import { useVariables } from '../editor/variablesContext';
import { resolveVariable, variableBakedText } from '../editor/extensions/variable';
import { Icon } from './icons';
import { serialize, downloadFile } from '../editor/serialize';
import { TextField } from './TextField';

type FormatId = 'pdf' | 'docx' | 'md' | 'txt' | 'json';

interface FormatDef {
  id: FormatId;
  name: string;
  desc: string;
  abbr: string;
  ext: string;
  badgeFg: string;
  badgeBg: string;
}

const FORMATS: FormatDef[] = [
  { id: 'pdf', name: 'PDF document', desc: 'Fixed layout, ready to share', abbr: 'PDF', ext: 'pdf', badgeFg: '#c2453a', badgeBg: '#fdf3f2' },
  { id: 'docx', name: 'Microsoft Word', desc: 'Editable, preserves formatting', abbr: 'DOCX', ext: 'docx', badgeFg: '#2b5797', badgeBg: '#eef4fb' },
  { id: 'md', name: 'Markdown', desc: 'Plain text with formatting', abbr: 'MD', ext: 'md', badgeFg: '#5f6b74', badgeBg: '#eef1f3' },
  { id: 'txt', name: 'Plain text', desc: 'No formatting', abbr: 'TXT', ext: 'txt', badgeFg: '#5f6b74', badgeBg: '#eef1f3' },
  { id: 'json', name: 'JSON', desc: 'Structured data, re-importable', abbr: 'JSON', ext: 'json', badgeFg: '#2f7d5b', badgeBg: '#edf6f0' },
];

const LABEL: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--color-muted)',
  textTransform: 'uppercase',
  letterSpacing: '.05em',
};

function stripIllegal(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '').trim();
}

function formatBytes(n: number): string {
  if (n < 1024) return `~${n} B`;
  if (n < 1024 * 1024) return `~${Math.round(n / 1024)} KB`;
  return `~${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function ExportPanelBody() {
  const { editor, title } = useEditorState();
  const { values } = useVariables();
  const [format, setFormat] = useState<FormatId>('pdf');
  const [filename, setFilename] = useState(title || 'Untitled');
  const [includeUnset, setIncludeUnset] = useState(true);

  const def = FORMATS.find((f) => f.id === format)!;

  // Per-format size estimate (cosmetic). md/txt from the real serialized bytes;
  // docx/pdf from a content-scaled heuristic.
  const estimate = useMemo(() => {
    if (!editor) return 0;
    const bytes = (s: string) => new Blob([s]).size;
    const text = editor.getText();
    switch (format) {
      case 'txt':
        return bytes(text);
      case 'md':
        return bytes(serialize(editor, 'markdown', { htmlFallback: true }));
      case 'docx':
        return 12 * 1024 + bytes(text) * 2;
      case 'pdf':
        return 28 * 1024 + bytes(text) * 3;
      case 'json':
        return bytes(serialize(editor, 'json'));
    }
  }, [editor, format]);

  if (!editor) return null;

  // Distinct unset variables actually present in the document.
  const unsetNames: string[] = [];
  {
    const seen = new Set<string>();
    editor.state.doc.descendants((n) => {
      if (n.type.name !== 'variable') return;
      const nm = n.attrs.name as string;
      if (!seen.has(nm) && resolveVariable(values, nm).unset) {
        seen.add(nm);
        unsetNames.push(nm);
      }
    });
  }

  // Plain text with variables baked (respecting the include-unset toggle).
  const bakedPlainText = () =>
    editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n\n', (leaf) =>
      leaf.type.name === 'variable'
        ? variableBakedText(values, leaf.attrs.name as string, { includeUnset })
        : (leaf.type.spec.leafText?.(leaf) ?? ''),
    );

  const download = () => {
    const name = stripIllegal(filename) || title || 'Untitled';
    switch (format) {
      case 'pdf': {
        // PDF = window.print(), which prints a clone of the LIVE document — so
        // the toggle can't bake text. Honor "omit unset" by hiding the unset
        // chips in the print clone via a temporary print-only rule (removed
        // after printing). With the toggle on, they print as the {{name}} chip.
        let hideStyle: HTMLStyleElement | null = null;
        if (!includeUnset && unsetNames.length > 0) {
          hideStyle = document.createElement('style');
          hideStyle.textContent =
            '@media print{.pgn-print-root .docs-var[data-var-unset]{display:none !important}}';
          document.head.appendChild(hideStyle);
          const cleanup = () => {
            hideStyle?.remove();
            hideStyle = null;
            window.removeEventListener('afterprint', cleanup);
          };
          window.addEventListener('afterprint', cleanup);
          setTimeout(cleanup, 2000); // fallback if afterprint never fires
        }
        window.print(); // browser "Save as PDF"
        break;
      }
      case 'docx':
        void import('../editor/export/docx')
          .then(({ downloadDocx }) =>
            downloadDocx(editor, name, { includeHeaderFooter: true, includeUnsetVariables: includeUnset }),
          )
          .catch((err) => console.error('DOCX export failed', err));
        break;
      case 'md':
        downloadFile(
          `${name}.md`,
          'text/markdown',
          serialize(editor, 'markdown', { htmlFallback: true, includeUnsetVariables: includeUnset }),
        );
        break;
      case 'txt':
        downloadFile(`${name}.txt`, 'text/plain', bakedPlainText());
        break;
      case 'json':
        // Canonical, lossless, re-importable. Keeps variable references (the
        // unset toggle intentionally doesn't apply here).
        downloadFile(`${name}.json`, 'application/json', serialize(editor, 'json'));
        break;
    }
  };

  const moveFormat = (dir: 1 | -1) => {
    const i = FORMATS.findIndex((f) => f.id === format);
    setFormat(FORMATS[(i + dir + FORMATS.length) % FORMATS.length]!.id);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" style={{ color: 'var(--ui-text)' }}>
      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px', display: 'flex', flexDirection: 'column', gap: 14 }} className="docs-scroll">
        {/* Format */}
        <div>
          <div style={{ ...LABEL, marginBottom: 8 }}>Format</div>
          <div role="radiogroup" aria-label="Format" style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {FORMATS.map((f) => {
              const on = f.id === format;
              return (
                <button
                  key={f.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  tabIndex={on ? 0 : -1}
                  onClick={() => setFormat(f.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                      e.preventDefault();
                      moveFormat(1);
                    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                      e.preventDefault();
                      moveFormat(-1);
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 9,
                    borderRadius: 8,
                    padding: '8px 10px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    border: on ? '1px solid var(--color-primary)' : '1px solid var(--ui-border-strong)',
                    background: on ? 'var(--ui-selected)' : 'transparent',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{ display: 'inline-flex', width: 32, height: 32, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 6, fontSize: 9, fontWeight: 700, color: f.badgeFg, background: f.badgeBg }}
                  >
                    {f.abbr}
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: on ? 'var(--color-primary)' : 'var(--color-ink)' }}>{f.name}</span>
                    <span style={{ fontSize: 10.5, color: on ? 'var(--ui-teal-muted)' : 'var(--color-muted)' }}>{f.desc}</span>
                  </span>
                  {on && <span aria-hidden="true" style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-primary)' }}>✓</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* File name */}
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={LABEL}>File name</span>
            <span style={{ fontSize: 10.5, color: 'var(--ui-faint)' }}>{formatBytes(estimate)}</span>
          </div>
          <TextField
            aria-label="File name"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            onBlur={() => setFilename((n) => stripIllegal(n) || title || 'Untitled')}
            suffix={`.${def.ext}`}
          />
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '12px 14px', borderTop: '1px solid var(--ui-divider)', background: 'var(--color-chrome)' }}>
        {unsetNames.length > 0 && format !== 'json' && (
          <div
            style={{
              marginBottom: 10,
              padding: 10,
              borderRadius: 8,
              background: 'var(--ui-amber-bg)',
              border: '1px solid color-mix(in srgb, var(--ui-amber) 35%, transparent)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: 'var(--ui-amber)' }}>
              <span aria-hidden="true">⚠</span>
              {unsetNames.length} variable{unsetNames.length === 1 ? '' : 's'} {unsetNames.length === 1 ? 'is' : 'are'} unset
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={includeUnset}
              onClick={() => setIncludeUnset((v) => !v)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                border: 'none',
                background: 'transparent',
                padding: 0,
                cursor: 'pointer',
                fontSize: 12,
                color: 'var(--ui-text)',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  position: 'relative',
                  width: 34,
                  height: 18,
                  flexShrink: 0,
                  borderRadius: 9,
                  background: includeUnset ? 'var(--color-primary)' : 'var(--ui-border-strong)',
                  transition: 'background .15s',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    top: 2,
                    left: includeUnset ? 18 : 2,
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    background: '#fff',
                    transition: 'left .15s',
                  }}
                />
              </span>
              Include unset variables
            </button>
            <span style={{ fontSize: 10.5, color: 'var(--ui-amber)', opacity: 0.85 }}>
              {includeUnset
                ? 'Unset variables export as {{technical_name}}.'
                : 'Unset variables are omitted from the export.'}
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={download}
          style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '8px 0', borderRadius: 7, border: 'none', background: 'var(--color-primary)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          <Icon.download size={15} />
          Download {def.abbr}
        </button>
      </div>
    </div>
  );
}
