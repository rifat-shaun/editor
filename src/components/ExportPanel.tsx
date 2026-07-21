/**
 * Export panel body (design 25a). Renders inside the ToolRail's Export panel —
 * which owns the 300px shell, the "Export" header and the close button — so this
 * component provides just the scrollable body (format picker + file name) plus a
 * fixed footer with the download button. Mounts fresh each time the panel opens.
 *
 * Formats → PDF (browser print dialog → Save as PDF), DOCX (docx-js), Markdown
 * (serializer), Plain text (getText). The unset-variables preview from the spec
 * is omitted (variables aren't implemented).
 */
import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { useEditorState } from '../editor/context';
import { Icon } from './icons';
import { serialize, downloadFile } from '../editor/serialize';

type FormatId = 'pdf' | 'docx' | 'md' | 'txt';

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
];

const LABEL: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--color-muted)',
  textTransform: 'uppercase',
  letterSpacing: '.05em',
};

function slugify(title: string): string {
  // Collapse every run of non-alphanumerics (spaces, punctuation, em-dashes, ×…)
  // into a single dash; keep unicode letters/digits so non-Latin titles survive.
  const s = title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
    .replace(/-+$/, '');
  return s || 'document';
}
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
  const [format, setFormat] = useState<FormatId>('pdf');
  const [filename, setFilename] = useState(() => slugify(title));
  const [done, setDone] = useState(false);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    }
  }, [editor, format]);

  if (!editor) return null;

  const flashDone = () => {
    setDone(true);
    if (doneTimer.current) clearTimeout(doneTimer.current);
    doneTimer.current = setTimeout(() => setDone(false), 2200);
  };

  const download = () => {
    const name = stripIllegal(filename) || slugify(title);
    switch (format) {
      case 'pdf':
        window.print(); // browser "Save as PDF"
        break;
      case 'docx':
        void import('../editor/export/docx')
          .then(({ downloadDocx }) => downloadDocx(editor, name, { includeHeaderFooter: true }))
          .catch((err) => console.error('DOCX export failed', err));
        break;
      case 'md':
        downloadFile(`${name}.md`, 'text/markdown', serialize(editor, 'markdown', { htmlFallback: true }));
        break;
      case 'txt':
        downloadFile(`${name}.txt`, 'text/plain', editor.getText());
        break;
    }
    flashDone();
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
          <div style={{ display: 'flex', alignItems: 'stretch', border: '1px solid var(--ui-border-strong)', borderRadius: 7, overflow: 'hidden' }}>
            <input
              type="text"
              aria-label="File name"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              onBlur={() => setFilename((n) => stripIllegal(n) || slugify(title))}
              style={{ flex: 1, minWidth: 0, padding: '7px 10px', fontSize: 12, color: 'var(--color-ink)', background: 'var(--ui-surface)', border: 'none', outline: 'none', font: 'inherit' }}
            />
            <span style={{ display: 'inline-flex', alignItems: 'center', padding: '7px 9px', fontSize: 12, color: 'var(--color-muted)', background: 'var(--color-chrome)', borderLeft: '1px solid var(--ui-divider)' }}>
              .{def.ext}
            </span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '12px 14px', borderTop: '1px solid var(--ui-divider)', background: 'var(--color-chrome)' }}>
        <button
          type="button"
          onClick={download}
          style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '8px 0', borderRadius: 7, border: 'none', background: 'var(--color-primary)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          <Icon.download size={15} />
          Download {def.abbr}
        </button>
        {done && (
          <div role="status" style={{ marginTop: 8, textAlign: 'center', fontSize: 11, color: 'var(--ui-teal-muted)' }}>
            ✓ {format === 'pdf' ? 'Opened print dialog' : 'Downloaded'}
          </div>
        )}
      </div>
    </div>
  );
}
