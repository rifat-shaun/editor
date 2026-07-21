import { useEffect, useRef, useState } from 'react';
import { useEditorState } from '../editor/context';
import type { EditorMode } from '../types';
import { Icon } from './icons';
import { Menu, MenuItem, ToolButton } from './primitives';
import { TextField } from './TextField';
import { MenuBar } from '../menus/MenuBar';
import { MENUS } from '../menus/menuData';

function DownloadWord() {
  const { editor, title } = useEditorState();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  if (!editor) return null;

  const run = async () => {
    setBusy(true);
    setError(false);
    try {
      // Lazy-load docx-js so it isn't in the main bundle.
      const { downloadDocx } = await import('../editor/export/docx');
      await downloadDocx(editor, title || 'Document', { includeHeaderFooter: true });
    } catch (err) {
      console.error('DOCX export failed', err);
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      disabled={busy}
      title={error ? 'Export failed — click to retry' : 'Download as Word (.docx)'}
      onClick={run}
      className={[
        'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold disabled:opacity-60',
        error
          ? 'border-[var(--ui-danger-border)] bg-[var(--ui-danger-bg)] text-[var(--ui-danger)]'
          : 'border-border text-ui hover:bg-[var(--ui-hover)]',
      ].join(' ')}
    >
      {busy ? <Icon.spinner size={14} /> : error ? <Icon.stop size={14} /> : <Icon.exportIcon size={14} />}
      {busy ? 'Exporting…' : error ? 'Retry export' : 'Word'}
    </button>
  );
}

const MODE_LABEL: Record<EditorMode, string> = {
  editing: '✎ Editing',
  viewing: '👁 Viewing',
};

const COLLABORATORS = [
  { name: 'Dana Ruiz', color: 'var(--color-primary)' },
  { name: 'Amir Shah', color: '#b5651d' },
  { name: 'Lee Park', color: '#7a4fd6' },
];

function relativeTime(ts: number | null): string {
  if (!ts) return 'All changes saved';
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins <= 0) return 'Saved · just now';
  if (mins === 1) return 'Saved · 1 min ago';
  return `Saved · ${mins} min ago`;
}

function ModePill() {
  const { mode, setMode } = useEditorState();
  return (
    <Menu
      align="right"
      trigger={({ toggle, open, id }) => (
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={id}
          onClick={toggle}
          className="inline-flex h-8 items-center gap-1 rounded-full border border-primary-border bg-primary-soft px-3 text-[12px] font-semibold text-primary"
        >
          {MODE_LABEL[mode]}
          <Icon.chevronDown size={13} />
        </button>
      )}
    >
      {(close) =>
        (['editing', 'viewing'] as EditorMode[]).map((m) => (
          <MenuItem
            key={m}
            onSelect={() => {
              setMode(m);
              close();
            }}
          >
            {MODE_LABEL[m].replace(/^\S+\s/, '')}
            {mode === m ? '  ✓' : ''}
          </MenuItem>
        ))
      }
    </Menu>
  );
}

export function TopBar() {
  const { title, setTitle, savedAt } = useEditorState();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);
  const [, force] = useState(0);

  useEffect(() => setDraft(title), [title]);
  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);
  // Re-render the "saved N min ago" pill every 30s.
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const commit = () => {
    setTitle(draft.trim() || 'Untitled document');
    setEditing(false);
  };

  return (
    <header className="print-hide flex h-14 shrink-0 items-center gap-3 border-b border-[var(--ui-divider)] bg-[var(--ui-surface)] px-3">
      <ToolButton label="Home" className="text-primary">
        <Icon.appGrid size={19} />
      </ToolButton>

      <div className="flex min-w-0 flex-col justify-center">
        <div className="flex items-center gap-2">
          {editing ? (
            <TextField
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') {
                  setDraft(title);
                  setEditing(false);
                }
              }}
              className="w-64"
              inputClassName="font-semibold text-ink"
              aria-label="Document title"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="truncate rounded px-1 text-[14px] font-semibold text-ink hover:bg-[var(--ui-hover)]"
              title="Rename"
            >
              {title}
            </button>
          )}
          <ToolButton label="Star document">
            <Icon.star size={16} />
          </ToolButton>
          <ToolButton label="Move to folder">
            <Icon.move size={16} />
          </ToolButton>
          <span className="rounded-full bg-[var(--ui-hover)] px-2 py-0.5 text-[10.5px] text-muted">
            {relativeTime(savedAt)}
          </span>
        </div>
        <MenuBar menus={MENUS} onRename={() => setEditing(true)} />
      </div>

      <div className="ml-auto flex items-center gap-2.5">
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-full px-2 text-[12px] text-ui hover:bg-[var(--ui-hover)]"
        >
          <Icon.comment size={16} />2
        </button>
        <ModePill />
        <DownloadWord />
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-4 text-[12px] font-semibold text-white hover:brightness-110"
        >
          <Icon.share size={14} />
          Share
        </button>
        <div className="flex items-center pl-1">
          {COLLABORATORS.map((c, i) => (
            <span
              key={c.name}
              title={c.name}
              style={{ background: c.color, marginLeft: i === 0 ? 0 : -8, zIndex: 10 - i }}
              className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold text-white ring-2 ring-white"
            >
              {c.name
                .split(' ')
                .map((p) => p[0])
                .join('')}
            </span>
          ))}
        </div>
      </div>
    </header>
  );
}
