import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { LinkKit } from './extensions/link';
import TextAlign from '@tiptap/extension-text-align';
import TextStyle from '@tiptap/extension-text-style';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import { buildTableExtensions } from './extensions/table';
import { CustomDocument, CustomOrderedList } from './extensions/listNumbering/extension';
import { CustomBulletList } from './extensions/bulletList/extension';
import { ListPaste } from './extensions/listPaste';
import { FontSize } from './extensions/fontSize';
import { LineHeight } from './extensions/lineHeight';
import { ParagraphSpacing } from './extensions/paragraphSpacing';
import { Indent } from './extensions/indent';
import { PageSetupBridge } from './extensions/pageSetupBridge';
import { NonPrinting } from './extensions/nonPrinting';
import { PageBreak } from './extensions/pageBreak';
import { SelectionHighlight } from './extensions/selectionHighlight';
import { ReadOnlyGuard } from './extensions/readOnlyGuard';

/**
 * The single source of truth for the editor's extension set. Exported so the
 * demo can build a headless editor with the *identical* schema to compute
 * accurate ProseMirror anchor positions for its canned AI changes.
 */
export function buildExtensions() {
  return [
    // `document` + `orderedList` are replaced by the numbering-engine versions
    // below (registry attr on the doc; listDefId on ordered lists).
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4] },
      document: false,
      orderedList: false,
      bulletList: false,
    }),
    CustomDocument,
    CustomOrderedList,
    CustomBulletList,
    Underline,
    TextStyle,
    FontSize, // adds a font-size attribute to textStyle so pasted sizes survive
    LineHeight, // block-level line-height attr on paragraph/heading (unitless)
    ParagraphSpacing, // block-level space before/after (margin-top/bottom, pt)
    Indent, // paragraph indents (left/right/first-line) — ruler + Align&indent
    NonPrinting, // view-only formatting marks (¶ · → ↵) — View menu toggle
    PageSetupBridge, // doc-attr page geometry → syncs the pagination engine
    LinkKit.configure({
      openOnClick: false, // clicks place the caret + show the hover card, never navigate
      autolink: true, // type a URL + space → auto-links
      linkOnPaste: true, // paste a URL over a selection → links it
      HTMLAttributes: { rel: 'noopener', target: '_blank' },
    }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Placeholder.configure({ placeholder: 'Start writing your document…' }),
    ...buildTableExtensions(),
    PageBreak,
    SelectionHighlight,
    ReadOnlyGuard, // view mode: block programmatic doc mutations (toolbar/⌘B/menu)
    ListPaste,
  ];
}
