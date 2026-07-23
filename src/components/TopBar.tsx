import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useEditorState } from '../editor/context';
import type { BrandLogo, EditorMode } from '../types';
import { Icon } from './icons';
import { Menu, MenuItem, ToolButton } from './primitives';
import { TextField } from './TextField';
import { MenuBar } from '../menus/MenuBar';
import { MENUS } from '../menus/menuData';

const MODE_LABEL: Record<EditorMode, string> = {
  editing: '✎ Editing',
  viewing: '👁 Viewing',
};

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

function toggleFullscreen(e: ReactMouseEvent<HTMLElement>) {
  const root = e.currentTarget.closest('[data-docs-editor-root]') as HTMLElement | null;
  if (document.fullscreenElement) void document.exitFullscreen();
  else void root?.requestFullscreen?.();
}

export function TopBar({
  brandLogo,
  onFullScreenClick,
  onCloseClick,
}: {
  brandLogo?: BrandLogo;
  onFullScreenClick?: () => void;
  onCloseClick?: () => void;
}) {
  const { title, setTitle, savedAt, mode, theme } = useEditorState();
  const viewing = mode === 'viewing';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);
  const [, force] = useState(0);

  useEffect(() => setDraft(title), [title]);
  // Leave title-edit mode (and never enter it) when the doc is view-only.
  useEffect(() => {
    if (viewing) setEditing(false);
  }, [viewing]);
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
    <header className="print-hide flex h-14 shrink-0 items-center gap-3 border-b border-(--ui-divider) bg-(--ui-surface) px-3">
      <ToolButton
        label={brandLogo?.alt ?? 'Home'}
        className="text-primary"
        onClick={brandLogo?.onBrandLogoClick}
      >
        {brandLogo ? (
          <img
            // Theme-aware: fall back to the light source when no dark variant
            // is provided. Constrained to the app-grid icon's footprint (19px)
            // so the logo drops in at the same size; object-contain preserves
            // the aspect ratio inside that box.
            src={theme === 'dark' ? (brandLogo.dark ?? brandLogo.light) : brandLogo.light}
            alt={brandLogo.alt ?? 'Home'}
            className="h-5 w-5 object-contain"
          />
        ) : (
          <Icon.appGrid size={19} />
        )}
      </ToolButton>

      <div className="flex min-w-0 flex-col justify-center">
        <div className="flex items-center gap-2 w-fit">
          {editing && !viewing ? (
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
              className="w-64! h-6!"
              inputClassName="font-semibold text-ink"
              aria-label="Document title"
            />
          ) : viewing ? (
            // View mode: the title is read-only (no rename affordance).
            <span className="truncate px-1 text-[14px] font-semibold text-ink h-6!">{title}</span>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="truncate  h-6! rounded px-1 text-[14px] font-semibold text-ink hover:bg-(--ui-hover)"
              title="Rename"
            >
              {title}
            </button>
          )}
          <span className="shrink-0 whitespace-nowrap rounded-full bg-(--ui-hover) px-2 py-0.5 text-[10.5px] text-muted">
            {relativeTime(savedAt)}
          </span>
        </div>
        <MenuBar menus={MENUS} onRename={() => setEditing(true)} />
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <ModePill />
        <div className="mr-1 ml-2 h-4 w-[2px] bg-(--ui-divider)" />
        <button
          type="button"
          // A consumer handler overrides the built-in native-fullscreen toggle.
          onClick={(e) => (onFullScreenClick ? onFullScreenClick() : toggleFullscreen(e))}
          aria-label="Toggle full screen"
          title="Full screen"
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-[var(--ui-hover)] hover:text-ui"
        >
          <Icon.fullscreen size={16} />
        </button>
        {/* Close is shown only when the consumer wires it. */}
        {onCloseClick && (
          <button
            type="button"
            onClick={() => onCloseClick()}
            aria-label="Close"
            title="Close"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-[var(--ui-hover)] hover:text-ui"
          >
            <Icon.x size={17} />
          </button>
        )}
      </div>
    </header>
  );
}
