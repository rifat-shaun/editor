import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import TextStyle from '@tiptap/extension-text-style';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import { DeletionMark, InsertionMark } from './extensions/redline';
import { Spotlight } from './extensions/spotlight';
import { buildTableExtensions } from './extensions/table';

/**
 * The single source of truth for the editor's extension set. Exported so the
 * demo can build a headless editor with the *identical* schema to compute
 * accurate ProseMirror anchor positions for its canned AI changes.
 */
export function buildExtensions() {
  return [
    StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }),
    Underline,
    TextStyle,
    Link.configure({ openOnClick: false, autolink: true }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Placeholder.configure({ placeholder: 'Start writing your document…' }),
    ...buildTableExtensions(),
    DeletionMark,
    InsertionMark,
    Spotlight,
  ];
}
