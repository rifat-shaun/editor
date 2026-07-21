/**
 * Command registry — the single dispatch table behind every menu item AND the
 * Help command-search. A `commandId` in the menu data resolves here.
 *
 * An item renders DISABLED when: no registry entry, the entry has no `run`, or
 * its `isEnabled` returns false. So unbuilt features are declared simply by
 * omitting `run` (a stub) — they can never silently no-op.
 *
 * Dynamic UI values (enabled/checked/badge) are computed here from editor state
 * each render, never stored in the menu data.
 */
import type { Editor } from '@tiptap/core';
import type { EditorStateValue } from '../editor/context';
import { lineHeightAtSelection } from '../components/lineHeightSelection';
import { downloadAs } from '../editor/serialize';

/** Host-provided UI actions that live outside the editor/context. */
export interface CmdServices {
  /** Focus the inline title editor in the TopBar. */
  startRename: () => void;
  /** Lazy-load + run the DOCX export. */
  downloadDocx: () => void;
  /** Open the word-count dialog. */
  openWordCount: () => void;
  /** Open the page-setup dialog. */
  openPageSetup: () => void;
  /** Confirmation prompt for destructive actions. */
  confirm: (message: string) => boolean;
}

export interface CmdCtx {
  editor: Editor;
  ui: EditorStateValue;
  svc: CmdServices;
}

export interface Command {
  /** Dispatch. Absent → the item is a disabled stub (unbuilt feature). */
  run?: (ctx: CmdCtx) => void;
  /** Enabled predicate (default true when `run` exists). */
  isEnabled?: (ctx: CmdCtx) => boolean;
  /** Checkbox/radio checked state. */
  isChecked?: (ctx: CmdCtx) => boolean;
  /** Right-slot count badge; null → hidden. */
  badge?: (ctx: CmdCtx) => { text: string; variant?: 'teal' | 'amber' } | null;
}

const chain = (editor: Editor) => editor.chain().focus();

/** Fit-width zoom (mirrors the toolbar's Fit width). */
function fitWidth({ editor, ui }: CmdCtx) {
  const dom = editor.view.dom as HTMLElement;
  const avail = (dom.parentElement?.clientWidth ?? 800) - 32;
  const pageW = parseFloat(getComputedStyle(dom).getPropertyValue('--pgn-page-width')) || 816;
  ui.setZoom(Math.max(50, Math.min(200, Math.floor((avail / pageW) * 100))));
}

async function pasteFromClipboard(editor: Editor, plainOnly: boolean) {
  try {
    if (!plainOnly && navigator.clipboard?.read) {
      const items = await navigator.clipboard.read();
      for (const it of items) {
        if (it.types.includes('text/html')) {
          const html = await (await it.getType('text/html')).text();
          chain(editor).insertContent(html).run();
          return;
        }
      }
    }
    const text = await navigator.clipboard.readText();
    if (text) chain(editor).insertContent(text).run();
  } catch (err) {
    console.warn('Clipboard paste unavailable', err);
  }
}

export const COMMANDS: Record<string, Command> = {
  /* ------------------------------- File ------------------------------- */
  'file.rename': { run: ({ svc }) => svc.startRename() },
  'download.docx': { run: ({ svc }) => svc.downloadDocx() },
  'file.print': { run: () => window.print() },
  // Unbuilt (disabled stubs — no `run`):
  'file.new': {}, 'file.newFromTemplate': {}, 'file.open': {},
  'file.makeCopy': {}, 'file.moveToFolder': {}, 'file.import': {},
  'download.pdf': {}, // PDF path not built (use Print)
  'download.markdown': { run: ({ editor, ui }) => downloadAs(editor, 'markdown', ui.title, { htmlFallback: true }) },
  'download.html': { run: ({ editor, ui }) => downloadAs(editor, 'html', ui.title, { mode: 'clean' }) },
  'file.versionHistory': {}, 'file.trash': {},
  'file.pageSetup': { run: ({ svc }) => svc.openPageSetup() },
  'template.blank': {}, 'template.letter': {}, 'template.report': {},

  /* ------------------------------- Edit ------------------------------- */
  'edit.undo': { run: ({ editor }) => chain(editor).undo().run(), isEnabled: ({ editor }) => editor.can().undo() },
  'edit.redo': { run: ({ editor }) => chain(editor).redo().run(), isEnabled: ({ editor }) => editor.can().redo() },
  'edit.cut': { run: ({ editor }) => { chain(editor).run(); document.execCommand('cut'); } },
  'edit.copy': { run: ({ editor }) => { chain(editor).run(); document.execCommand('copy'); } },
  'edit.paste': { run: ({ editor }) => void pasteFromClipboard(editor, false) },
  'edit.pasteNoFormat': { run: ({ editor }) => void pasteFromClipboard(editor, true) },
  'edit.selectAll': { run: ({ editor }) => chain(editor).selectAll().run() },
  'edit.findReplace': {}, // unbuilt

  /* ------------------------------- View ------------------------------- */
  'view.mode.editing': { run: ({ ui }) => ui.setMode('editing'), isChecked: ({ ui }) => ui.mode === 'editing' },
  'view.mode.suggesting': { run: ({ ui }) => ui.setMode('suggesting'), isChecked: ({ ui }) => ui.mode === 'suggesting' },
  'view.mode.viewing': { run: ({ ui }) => ui.setMode('viewing'), isChecked: ({ ui }) => ui.mode === 'viewing' },
  'view.showOutline': { run: ({ ui }) => ui.toggleOutline(), isChecked: ({ ui }) => ui.outlineOpen },
  'view.showRuler': { run: ({ ui }) => ui.toggleRuler(), isChecked: ({ ui }) => ui.showRuler },
  'view.showNonPrinting': {}, 'view.showSuggestedEdits': {}, // unbuilt toggles
  'view.zoom.50': { run: ({ ui }) => ui.setZoom(50), isChecked: ({ ui }) => ui.zoom === 50 },
  'view.zoom.75': { run: ({ ui }) => ui.setZoom(75), isChecked: ({ ui }) => ui.zoom === 75 },
  'view.zoom.100': { run: ({ ui }) => ui.setZoom(100), isChecked: ({ ui }) => ui.zoom === 100 },
  'view.zoom.125': { run: ({ ui }) => ui.setZoom(125), isChecked: ({ ui }) => ui.zoom === 125 },
  'view.zoom.150': { run: ({ ui }) => ui.setZoom(150), isChecked: ({ ui }) => ui.zoom === 150 },
  'view.zoom.200': { run: ({ ui }) => ui.setZoom(200), isChecked: ({ ui }) => ui.zoom === 200 },
  'view.zoom.fitWidth': { run: (ctx) => fitWidth(ctx) },
  'view.fullScreen': {
    run: () => {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen?.();
    },
  },
  'view.present': {}, // unbuilt

  /* ------------------------------ Insert ------------------------------ */
  'insert.image.upload': {}, 'insert.image.byUrl': {}, // image node not built
  'insert.table': { run: ({ editor }) => chain(editor).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  'insert.link': {
    run: ({ editor }) => {
      const url = window.prompt('Link URL');
      if (url) chain(editor).setLink({ href: url }).run();
    },
  },
  'insert.hr': { run: ({ editor }) => chain(editor).setHorizontalRule().run() },
  'insert.variable': {}, 'insert.comment': {}, // unbuilt
  'insert.aiDraft': { run: ({ ui }) => ui.ai.openPrompt() },
  'insert.pageBreak': { run: ({ editor }) => chain(editor).insertPageBreak().run() },
  'insert.headersFooters': {}, 'insert.pageNumbers': {}, 'insert.toc': {}, 'insert.specialChars': {}, // unbuilt

  /* ------------------------------ Format ------------------------------ */
  'format.bold': { run: ({ editor }) => chain(editor).toggleBold().run(), isChecked: ({ editor }) => editor.isActive('bold') },
  'format.italic': { run: ({ editor }) => chain(editor).toggleItalic().run(), isChecked: ({ editor }) => editor.isActive('italic') },
  'format.underline': { run: ({ editor }) => chain(editor).toggleUnderline().run(), isChecked: ({ editor }) => editor.isActive('underline') },
  'format.strike': { run: ({ editor }) => chain(editor).toggleStrike().run(), isChecked: ({ editor }) => editor.isActive('strike') },
  'format.subscript': {}, 'format.superscript': {}, // not in schema
  'style.body': { run: ({ editor }) => chain(editor).setParagraph().run(), isChecked: ({ editor }) => editor.isActive('paragraph') },
  'style.h1': { run: ({ editor }) => chain(editor).toggleHeading({ level: 1 }).run(), isChecked: ({ editor }) => editor.isActive('heading', { level: 1 }) },
  'style.h2': { run: ({ editor }) => chain(editor).toggleHeading({ level: 2 }).run(), isChecked: ({ editor }) => editor.isActive('heading', { level: 2 }) },
  'style.h3': { run: ({ editor }) => chain(editor).toggleHeading({ level: 3 }).run(), isChecked: ({ editor }) => editor.isActive('heading', { level: 3 }) },
  'style.h4': { run: ({ editor }) => chain(editor).toggleHeading({ level: 4 }).run(), isChecked: ({ editor }) => editor.isActive('heading', { level: 4 }) },
  'align.left': { run: ({ editor }) => chain(editor).setTextAlign('left').run(), isChecked: ({ editor }) => editor.isActive({ textAlign: 'left' }) },
  'align.center': { run: ({ editor }) => chain(editor).setTextAlign('center').run(), isChecked: ({ editor }) => editor.isActive({ textAlign: 'center' }) },
  'align.right': { run: ({ editor }) => chain(editor).setTextAlign('right').run(), isChecked: ({ editor }) => editor.isActive({ textAlign: 'right' }) },
  'align.justify': { run: ({ editor }) => chain(editor).setTextAlign('justify').run(), isChecked: ({ editor }) => editor.isActive({ textAlign: 'justify' }) },
  'align.indent': { run: ({ editor }) => editor.chain().focus().indentMore().run() },
  'align.outdent': { run: ({ editor }) => editor.chain().focus().indentLess().run() },
  'spacing.line.1': { run: ({ editor }) => chain(editor).setLineHeight('1').run(), isChecked: ({ editor }) => lineHeightAtSelection(editor) === '1' },
  'spacing.line.1.15': { run: ({ editor }) => chain(editor).setLineHeight('1.15').run(), isChecked: ({ editor }) => lineHeightAtSelection(editor) === '1.15' },
  'spacing.line.1.5': { run: ({ editor }) => chain(editor).setLineHeight('1.5').run(), isChecked: ({ editor }) => lineHeightAtSelection(editor) === '1.5' },
  'spacing.line.2': { run: ({ editor }) => chain(editor).setLineHeight('2').run(), isChecked: ({ editor }) => lineHeightAtSelection(editor) === '2' },
  'spacing.before': { run: ({ editor }) => chain(editor).addSpaceBefore().run() },
  'spacing.after': { run: ({ editor }) => chain(editor).addSpaceAfter().run() },
  'list.numbered': {
    run: ({ editor }) => { chain(editor).toggleOrderedList().run(); editor.commands.applyListPreset('decimal'); },
    isChecked: ({ editor }) => editor.isActive('orderedList'),
  },
  'list.bulleted': {
    run: ({ editor }) => { chain(editor).toggleBulletList().run(); editor.commands.applyBulletPreset('classic'); },
    isChecked: ({ editor }) => editor.isActive('bulletList'),
  },
  'list.checklist': { run: ({ editor }) => chain(editor).toggleTaskList().run(), isChecked: ({ editor }) => editor.isActive('taskList') },
  'format.columns': {}, 'format.pageColor': {}, // unbuilt
  'table.insert': { run: ({ editor }) => chain(editor).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  'table.addRow': { run: ({ editor }) => chain(editor).addRowAfter().run(), isEnabled: ({ editor }) => editor.isActive('table') },
  'table.deleteRow': { run: ({ editor }) => chain(editor).deleteRow().run(), isEnabled: ({ editor }) => editor.isActive('table') },
  'table.addColumn': { run: ({ editor }) => chain(editor).addColumnAfter().run(), isEnabled: ({ editor }) => editor.isActive('table') },
  'table.deleteColumn': { run: ({ editor }) => chain(editor).deleteColumn().run(), isEnabled: ({ editor }) => editor.isActive('table') },
  'table.delete': { run: ({ editor }) => chain(editor).deleteTable().run(), isEnabled: ({ editor }) => editor.isActive('table') },
  'format.clearFormatting': { run: ({ editor }) => chain(editor).unsetAllMarks().clearNodes().run() },

  /* ------------------------------- Tools ------------------------------ */
  'tools.aiEdit': { run: ({ ui }) => ui.ai.openPrompt() },
  'tools.reviewAi': {
    run: ({ ui }) => ui.ai.focusNext(),
    isEnabled: ({ ui }) => ui.ai.counts.pending > 0,
    badge: ({ ui }) => (ui.ai.counts.pending > 0 ? { text: String(ui.ai.counts.pending), variant: 'teal' } : null),
  },
  'tools.spellingGrammar': {}, // unbuilt
  'tools.wordCount': { run: ({ svc }) => svc.openWordCount() },
  'tools.variables': { badge: () => null }, // feature not built → no run (disabled), badge always hidden
  'tools.compare': {}, 'tools.citations': {}, 'tools.preferences': {}, // unbuilt

  /* -------------------------------- Help ------------------------------ */
  'help.center': {}, 'help.keyboardShortcuts': {}, 'help.whatsNew': {},
  'help.report': {}, 'help.privacy': {}, 'help.terms': {}, // unbuilt (external/stub)
};

/** Resolve a command; `undefined` → treat as a disabled stub. */
export function getCommand(id: string): Command | undefined {
  return COMMANDS[id];
}

/** Whether an item id should render enabled. */
export function isItemEnabled(id: string, ctx: CmdCtx): boolean {
  const cmd = COMMANDS[id];
  if (!cmd || !cmd.run) return false;
  return cmd.isEnabled ? cmd.isEnabled(ctx) : true;
}
