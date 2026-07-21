/**
 * Reading the current paragraph's indents at the cursor, for the ruler markers.
 * Representative of the block at the caret; `mixed` flags a multi-block
 * selection whose indents disagree (ruler shows the first block's values as a
 * neutral representative). Plain, testable — mirrors the font-size indicator.
 */
import type { Editor } from '@tiptap/core';
import { INDENT_TYPES } from '../editor/extensions/indent';

export interface IndentState {
  left: number;
  right: number;
  firstLine: number;
  mixed: boolean;
}

export function indentAtSelection(editor: Editor): IndentState {
  const { doc, selection } = editor.state;
  const { from, to } = selection;
  const types: readonly string[] = INDENT_TYPES;
  let first: IndentState | null = null;
  let mixed = false;
  doc.nodesBetween(from, to, (node) => {
    if (!types.includes(node.type.name)) return;
    const cur = {
      left: (node.attrs.indentLeft as number) || 0,
      right: (node.attrs.indentRight as number) || 0,
      firstLine: (node.attrs.indentFirstLine as number) || 0,
    };
    if (!first) first = { ...cur, mixed: false };
    else if (cur.left !== first.left || cur.right !== first.right || cur.firstLine !== first.firstLine) mixed = true;
  });
  if (!first) return { left: 0, right: 0, firstLine: 0, mixed: false };
  return { ...(first as IndentState), mixed };
}
