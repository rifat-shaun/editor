import type { JSONContent } from '@tiptap/core';

export type { JSONContent };

export type EditorMode = 'editing' | 'viewing';

export interface DocsEditorProps {
  initialContent: JSONContent;
  mode: EditorMode;
  onSave(content: JSONContent): void;
  /** Optional document title shown in the top bar (inline-renameable). */
  title?: string;
  onTitleChange?(title: string): void;
  className?: string;
}
