import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useEditorState } from '../editor/context';
import type { AiScope } from '../types';
import { fontSizeAtSelection, BASE_FONT_PT } from './fontSizeSelection';
import { Icon } from './icons';
import { Menu, MenuItem, MenuLabel, Segmented, ToolbarDivider, ToolButton } from './primitives';
import { TableGridPicker } from './TableGridPicker';
import { NumberedListMenu } from './NumberedListStylePicker';
import { BulletListMenu } from './BulletListStylePicker';
import { Select, type SelectOption } from './Select';

const PARA_OPTIONS: SelectOption[] = [
  { value: 'body', label: 'Body text' },
  { value: 'h1', label: 'Title' },
  { value: 'h2', label: 'Heading 2' },
  { value: 'h3', label: 'Heading 3' },
  { value: 'h4', label: 'Heading 4' },
];
const PARA_STYLE: Record<string, CSSProperties> = {
  body: { fontSize: 13 },
  h1: { fontSize: 19, fontWeight: 700 },
  h2: { fontSize: 16, fontWeight: 700 },
  h3: { fontSize: 14, fontWeight: 700 },
  h4: { fontSize: 13, fontWeight: 700 },
};
const FONT_FAMILIES = [
  'Georgia', 'Times New Roman', 'Arial', 'Helvetica', 'Calibri', 'Cambria',
  'Garamond', 'Verdana', 'Tahoma', 'Courier New', 'system-ui',
];
const ZOOM_LEVELS = [50, 75, 90, 100, 125, 150, 200];
const FONT_SIZES_PT = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72, 96];

const PRESETS: { label: string; instruction: string }[] = [
  { label: 'Shorten', instruction: 'Make this more concise without losing meaning.' },
  { label: 'Formalize tone', instruction: 'Rewrite in a more formal, professional tone.' },
  { label: 'Fix grammar & clarity', instruction: 'Fix grammar and improve clarity.' },
];

/**
 * Toolbar groups in display order. `keep` is the priority used by the
 * responsive overflow logic — higher survives longer; lower-priority groups
 * collapse into the "More" menu first. `Infinity` never collapses.
 */
const GROUP_META: { id: string; keep: number }[] = [
  { id: 'outline', keep: Infinity },
  { id: 'history', keep: 90 },
  { id: 'zoom', keep: 30 },
  { id: 'para', keep: 85 },
  { id: 'font', keep: 40 },
  { id: 'fontsize', keep: 45 },
  { id: 'format', keep: 88 },
  { id: 'align', keep: 65 },
  { id: 'lists', keep: 70 },
  { id: 'insert', keep: 50 },
];

// Per-group separator (gap + divider) and space reserved for the docked
// right cluster (More button + AI edit button + padding).
const SEP = 12;
const RIGHT_RESERVE = 152;

function useForceRerenderOnSelection() {
  // Re-render toolbar active states when the selection or document changes.
  const { editor } = useEditorState();
  const [, set] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const bump = () => set((n) => n + 1);
    editor.on('selectionUpdate', bump);
    editor.on('transaction', bump);
    return () => {
      editor.off('selectionUpdate', bump);
      editor.off('transaction', bump);
    };
  }, [editor]);
}

function AiEditMenu() {
  const { ai } = useEditorState();
  const [scope, setScope] = useState<AiScope>('selection');

  return (
    <Menu
      align="right"
      panelClassName="min-w-[248px]"
      trigger={({ toggle, open, id }) => (
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={id}
          onClick={toggle}
          className="inline-flex h-8 items-center gap-1 rounded-[6px] bg-primary-soft px-2.5 text-[12px] font-semibold text-primary hover:brightness-105"
        >
          <Icon.sparkle size={14} />
          AI edit
          <Icon.chevronDown size={13} />
        </button>
      )}
    >
      {(close) => (
        <>
          <MenuLabel>Apply to</MenuLabel>
          <div className="px-2 pb-1.5">
            <Segmented<AiScope>
              label="Apply scope"
              value={scope}
              onChange={setScope}
              options={[
                { value: 'selection', label: 'Selection' },
                { value: 'section', label: 'Section' },
                { value: 'document', label: 'Document' },
              ]}
            />
          </div>
          <div className="my-1 h-px bg-border" />
          <MenuItem
            icon={<Icon.sparkle size={14} />}
            onSelect={() => {
              close();
              ai.openPrompt();
            }}
          >
            Custom instruction…
          </MenuItem>
          {PRESETS.map((p) => (
            <MenuItem
              key={p.label}
              onSelect={() => {
                close();
                void ai.run(p.instruction, scope);
              }}
            >
              {p.label}
            </MenuItem>
          ))}
        </>
      )}
    </Menu>
  );
}

export function FormattingToolbar() {
  const { editor, zoom, setZoom, outlineOpen, toggleOutline } = useEditorState();
  useForceRerenderOnSelection();
  const editorReady = !!editor;
  const [fontFamily, setFontFamily] = useState('Georgia');

  // --- Responsive priority-overflow bookkeeping ---
  const containerRef = useRef<HTMLDivElement>(null);
  const widthsRef = useRef<Record<string, number>>({});
  const groupElRefs = useRef<Record<string, HTMLElement | null>>({});
  const [measured, setMeasured] = useState(false);
  const [overflow, setOverflow] = useState<string[]>([]);

  const recompute = useCallback(() => {
    const c = containerRef.current;
    if (!c) return;
    const avail = c.clientWidth - RIGHT_RESERVE;
    const w = (id: string) => (widthsRef.current[id] ?? 44) + SEP;
    let used = GROUP_META.reduce((s, g) => s + w(g.id), 0);
    const dropped = new Set<string>();
    for (const g of [...GROUP_META]
      .filter((g) => g.keep !== Infinity)
      .sort((a, b) => a.keep - b.keep)) {
      if (used <= avail) break;
      dropped.add(g.id);
      used -= w(g.id);
    }
    setOverflow((prev) => {
      const next = GROUP_META.filter((g) => dropped.has(g.id)).map((g) => g.id);
      return prev.length === next.length && prev.every((id, i) => id === next[i]) ? prev : next;
    });
  }, []);

  // Measure natural group widths once everything is inline, then fit.
  useLayoutEffect(() => {
    if (measured) return;
    let all = GROUP_META.length > 0;
    for (const g of GROUP_META) {
      const el = groupElRefs.current[g.id];
      if (el) widthsRef.current[g.id] = el.getBoundingClientRect().width;
      else all = false;
    }
    if (all) {
      setMeasured(true);
      recompute();
    }
  }, [measured, editorReady, recompute]);

  useEffect(() => {
    const c = containerRef.current;
    if (!c || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => recompute());
    ro.observe(c);
    return () => ro.disconnect();
  }, [recompute, editorReady]);

  if (!editor) return <div className="print-hide h-10 border-b border-border bg-chrome" />;

  const chain = () => editor.chain().focus();
  // Font size (POINTS) at the caret/selection: the fontSize mark if set, else the
  // effective heading/base size; `null` when the selection spans mixed sizes.
  const fontPt = fontSizeAtSelection(editor);
  // Points end-to-end: the mark is stored as "<n>pt"; stepping is exact.
  const applyPt = (pt: number) => {
    const clamped = Math.max(6, Math.min(72, Math.round(pt)));
    chain().setFontSize(`${clamped}pt`).run();
  };

  const paraValue = editor.isActive('heading', { level: 1 })
    ? 'h1'
    : editor.isActive('heading', { level: 2 })
      ? 'h2'
      : editor.isActive('heading', { level: 3 })
        ? 'h3'
        : editor.isActive('heading', { level: 4 })
          ? 'h4'
          : 'body';

  const setPara = (v: string) => {
    if (v === 'body') chain().setParagraph().run();
    else chain().toggleHeading({ level: Number(v[1]) as 1 | 2 | 3 | 4 }).run();
  };

  const applyFontFamily = (f: string) => {
    setFontFamily(f);
    (editor.view.dom as HTMLElement).style.fontFamily = f;
  };

  const applyZoom = (v: string) => {
    if (v === 'fit-width' || v === 'fit-page') {
      const dom = editor.view.dom as HTMLElement;
      const avail = (dom.parentElement?.clientWidth ?? 800) - 32;
      const pageW = parseFloat(getComputedStyle(dom).getPropertyValue('--pgn-page-width')) || 816;
      let z = Math.floor((avail / pageW) * 100);
      if (v === 'fit-page') {
        const availH = window.innerHeight - 160;
        z = Math.min(z, Math.floor((availH / 1056) * 100)); // ~Letter page height
      }
      setZoom(Math.max(50, Math.min(200, z)));
    } else {
      setZoom(Number(v));
    }
  };

  // Font family from the whole-editor DOM style (family isn't a per-run mark);
  // recently-used (current) pinned on top.
  const fontOptions: SelectOption[] = [
    { value: fontFamily, label: fontFamily, group: 'Recently used' },
    ...FONT_FAMILIES.filter((f) => f !== fontFamily).map((f) => ({ value: f, label: f, group: 'Fonts' })),
  ];

  const nodeById: Record<string, ReactNode> = {
    outline: (
      <ToolButton
        label={outlineOpen ? 'Hide outline' : 'Show outline'}
        active={outlineOpen}
        onClick={toggleOutline}
      >
        <Icon.panelLeft size={16} />
      </ToolButton>
    ),
    history: (
      <>
        <ToolButton label="Undo (⌘Z)" onClick={() => chain().undo().run()}>
          <Icon.undo size={16} />
        </ToolButton>
        <ToolButton label="Redo (⌘⇧Z)" onClick={() => chain().redo().run()}>
          <Icon.redo size={16} />
        </ToolButton>
        <ToolButton label="Print" onClick={() => window.print()}>
          <Icon.print size={16} />
        </ToolButton>
        <ToolButton label="Spellcheck">
          <Icon.spellcheck size={16} />
        </ToolButton>
      </>
    ),
    zoom: (
      <Select
        ariaLabel="Zoom"
        className="min-w-[68px]"
        value={String(zoom)}
        onChange={applyZoom}
        options={[
          ...ZOOM_LEVELS.map((z) => ({ value: String(z), label: `${z}%` })),
          { value: 'fit-width', label: 'Fit width', group: 'Fit' },
          { value: 'fit-page', label: 'Fit page', group: 'Fit' },
        ]}
        renderTriggerLabel={(o) => (o ? o.label : `${zoom}%`)}
      />
    ),
    para: (
      <Select
        ariaLabel="Paragraph style"
        className="min-w-[104px]"
        value={paraValue}
        onChange={setPara}
        options={PARA_OPTIONS}
        renderOption={(o) => <span style={PARA_STYLE[o.value]}>{o.label}</span>}
      />
    ),
    font: (
      <Select
        ariaLabel="Font"
        className="min-w-[116px]"
        value={fontFamily}
        onChange={applyFontFamily}
        options={fontOptions}
        searchPlaceholder="Search fonts…"
        renderOption={(o) => (
          <span style={{ fontFamily: o.value }}>{o.label}</span>
        )}
      />
    ),
    fontsize: (
      <>
        <ToolButton label="Decrease font size" onClick={() => applyPt((fontPt ?? BASE_FONT_PT) - 1)}>
          <Icon.minus size={15} />
        </ToolButton>
        <Select
          ariaLabel="Font size"
          className="w-[52px]"
          value={fontPt === null ? null : String(fontPt)}
          onChange={(v) => applyPt(Number(v))}
          editable={{ onCommit: (raw) => raw && applyPt(Number(raw)) }}
          placeholder="–"
          options={FONT_SIZES_PT.map((s) => ({ value: String(s), label: String(s) }))}
        />
        <ToolButton label="Increase font size" onClick={() => applyPt((fontPt ?? BASE_FONT_PT) + 1)}>
          <Icon.plus size={15} />
        </ToolButton>
      </>
    ),
    format: (
      <>
        <ToolButton
          label="Bold (⌘B)"
          active={editor.isActive('bold')}
          onClick={() => chain().toggleBold().run()}
        >
          <Icon.bold size={16} />
        </ToolButton>
        <ToolButton
          label="Italic (⌘I)"
          active={editor.isActive('italic')}
          onClick={() => chain().toggleItalic().run()}
        >
          <Icon.italic size={16} />
        </ToolButton>
        <ToolButton
          label="Underline (⌘U)"
          active={editor.isActive('underline')}
          onClick={() => chain().toggleUnderline().run()}
        >
          <Icon.underline size={16} />
        </ToolButton>
        <ToolButton
          label="Strikethrough"
          active={editor.isActive('strike')}
          onClick={() => chain().toggleStrike().run()}
        >
          <Icon.strike size={16} />
        </ToolButton>
        <ToolButton label="Text color">
          <Icon.textColor size={16} />
        </ToolButton>
      </>
    ),
    align: (
      <>
        <ToolButton
          label="Align left"
          active={editor.isActive({ textAlign: 'left' })}
          onClick={() => chain().setTextAlign('left').run()}
        >
          <Icon.alignLeft size={16} />
        </ToolButton>
        <ToolButton
          label="Align center"
          active={editor.isActive({ textAlign: 'center' })}
          onClick={() => chain().setTextAlign('center').run()}
        >
          <Icon.alignCenter size={16} />
        </ToolButton>
        <ToolButton
          label="Align right"
          active={editor.isActive({ textAlign: 'right' })}
          onClick={() => chain().setTextAlign('right').run()}
        >
          <Icon.alignRight size={16} />
        </ToolButton>
        <ToolButton
          label="Justify"
          active={editor.isActive({ textAlign: 'justify' })}
          onClick={() => chain().setTextAlign('justify').run()}
        >
          <Icon.alignJustify size={16} />
        </ToolButton>
      </>
    ),
    lists: (
      <>
        <span className="inline-flex items-center">
          <ToolButton
            label="Bullet list"
            active={editor.isActive('bulletList')}
            onClick={() => {
              // Turning a bullet list ON applies the default (classic) preset so
              // markers render consistently with the picker default.
              if (editor.isActive('bulletList')) {
                chain().toggleBulletList().run();
              } else {
                chain().toggleBulletList().run();
                editor.commands.applyBulletPreset('classic');
              }
            }}
            className="min-w-7 px-1"
          >
            <Icon.bulletList size={16} />
          </ToolButton>
          <BulletListMenu editor={editor} />
        </span>
        <span className="inline-flex items-center">
          <ToolButton
            label="Numbered list"
            active={editor.isActive('orderedList')}
            onClick={() => {
              // Turning a list ON also applies the default preset so it renders
              // with markers (1. / a. / i., nesting-aware) — matching the
              // dropdown's default. Turning it OFF just toggles.
              if (editor.isActive('orderedList')) {
                chain().toggleOrderedList().run();
              } else {
                chain().toggleOrderedList().run();
                editor.commands.applyListPreset('decimal');
              }
            }}
            className="min-w-7 px-1"
          >
            <Icon.orderedList size={16} />
          </ToolButton>
          <NumberedListMenu editor={editor} />
        </span>
        <ToolButton
          label="Checklist"
          active={editor.isActive('taskList')}
          onClick={() => chain().toggleTaskList().run()}
        >
          <Icon.checklist size={16} />
        </ToolButton>
      </>
    ),
    insert: (
      <>
        <ToolButton
          label="Insert link"
          active={editor.isActive('link')}
          onClick={() => {
            const url = window.prompt('Link URL');
            if (url) chain().setLink({ href: url }).run();
            else chain().unsetLink().run();
          }}
        >
          <Icon.link size={16} />
        </ToolButton>
        <ToolButton
          label="Block quote"
          active={editor.isActive('blockquote')}
          onClick={() => chain().toggleBlockquote().run()}
        >
          <Icon.quote size={16} />
        </ToolButton>
        <TableGridPicker editor={editor} />
        <ToolButton label="Insert image">
          <Icon.image size={16} />
        </ToolButton>
        <ToolButton label="Insert page break" onClick={() => chain().insertPageBreak().run()}>
          <Icon.pageSetup size={16} />
        </ToolButton>
      </>
    ),
  };

  const isHidden = (id: string) => measured && overflow.includes(id);
  const visible = GROUP_META.filter((g) => !isHidden(g.id));
  const overflowed = GROUP_META.filter((g) => isHidden(g.id));

  return (
    <div
      ref={containerRef}
      className="print-hide flex h-10 shrink-0 items-center gap-0.5 overflow-hidden border-b border-border bg-chrome px-2"
    >
      {visible.map((g, i) => (
        <div key={g.id} className="flex shrink-0 items-center gap-0.5">
          {i > 0 && <ToolbarDivider />}
          <div
            ref={(el) => (groupElRefs.current[g.id] = el)}
            className="flex shrink-0 items-center gap-0.5"
          >
            {nodeById[g.id]}
          </div>
        </div>
      ))}

      <div className="ml-auto flex shrink-0 items-center gap-1 pl-2">
        {overflowed.length > 0 && (
          <Menu
            align="right"
            panelClassName="min-w-[220px] p-2"
            trigger={({ toggle, open, id }) => (
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={open}
                aria-controls={id}
                aria-label="More formatting options"
                title="More"
                onClick={toggle}
                className="inline-flex h-8 min-w-8 items-center justify-center rounded-[5px] text-ui hover:bg-[#eef1f3]"
              >
                <Icon.more size={18} />
              </button>
            )}
          >
            {() => (
              <div className="flex flex-col gap-0.5">
                {overflowed.map((g) => (
                  <div key={g.id} className="flex flex-wrap items-center gap-0.5 rounded-md px-0.5 py-0.5">
                    {nodeById[g.id]}
                  </div>
                ))}
              </div>
            )}
          </Menu>
        )}
        <AiEditMenu />
      </div>
    </div>
  );
}
