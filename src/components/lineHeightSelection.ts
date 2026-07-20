/**
 * Reading the effective line height at the editor selection, for the toolbar's
 * line-spacing indicator. Kept out of the component file so it's a plain,
 * testable function (and so Fast Refresh keeps working for the component).
 *
 * Returns the shared `lineHeight` attribute of the text blocks in range as a
 * string (`"1.5"`, `"24px"`, …), the sentinel `DEFAULT` when the block(s) carry
 * no explicit value (inheriting the base), or `null` when the selection spans
 * blocks with DIFFERENT values (→ the control shows a blank placeholder).
 */
import type { Editor } from '@tiptap/core';
import { LINE_HEIGHT_TYPES } from '../editor/extensions/lineHeight';

/** Sentinel value shown when a block has no explicit line height (inherits base). */
export const DEFAULT_LINE_HEIGHT = 'default';

export function lineHeightAtSelection(editor: Editor): string | null {
  const { doc, selection } = editor.state;
  const { from, to } = selection;
  const types: readonly string[] = LINE_HEIGHT_TYPES;
  let value: string | null = null;
  let seen = false;
  let mixed = false;
  doc.nodesBetween(from, to, (node, _pos) => {
    if (mixed || !types.includes(node.type.name)) return;
    const lh = (node.attrs.lineHeight as string | null) ?? DEFAULT_LINE_HEIGHT;
    if (!seen) {
      value = lh;
      seen = true;
    } else if (value !== lh) {
      mixed = true;
    }
  });
  if (mixed) return null;
  return seen ? value : DEFAULT_LINE_HEIGHT;
}
