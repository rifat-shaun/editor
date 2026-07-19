/**
 * Reading the effective font size at the editor selection, for the toolbar's
 * size indicator. Kept out of the component file so it's a plain, testable
 * function (and so Fast Refresh keeps working for the component).
 */
import type { Editor } from '@tiptap/core';
import type { Mark, Node as PMNode } from '@tiptap/pm/model';

// Base + per-heading POINT sizes — must mirror `.docs-page-content` in styles.css.
// Used ONLY to reflect the effective size when there is no explicit fontSize mark.
// The editor is points end-to-end; new sizes are written as "<n>pt".
export const BASE_FONT_PT = 12;
export const HEADING_FONT_PT: Record<number, number> = { 1: 21, 2: 18, 3: 15, 4: 12 };

/** Parse a fontSize mark value to POINTS. Native marks are "…pt"; imported
 *  (pasted Word/web) content may be "…px" → treated as visual-parity pt. */
function sizeToPt(fs: string): number | null {
  const m = /^([\d.]+)(px|pt|em|rem)?$/.exec(fs.trim());
  if (!m) return null;
  const n = parseFloat(m[1]!);
  if (!Number.isFinite(n)) return null;
  const unit = m[2] || 'pt';
  const pt = unit === 'px' ? n * 0.75 : unit === 'em' || unit === 'rem' ? n * 12 : n;
  return Math.round(pt);
}

/** Effective pt size of a text run: its fontSize mark, else its block's size. */
function effectiveFontPt(marks: readonly Mark[], block: PMNode | null): number {
  const fs = marks.find((m) => m.type.name === 'textStyle')?.attrs.fontSize as string | undefined;
  if (fs) {
    const pt = sizeToPt(fs);
    if (pt != null) return pt;
  }
  if (block?.type.name === 'heading') return HEADING_FONT_PT[block.attrs.level as number] ?? BASE_FONT_PT;
  return BASE_FONT_PT;
}

/**
 * The font size (in POINTS) to show for the current selection: a number, or
 * `null` when the selection spans multiple sizes (→ blank/placeholder). Reads
 * the actual marks at the caret (not storedMarks), and falls back to the
 * heading/base size when no fontSize mark is set.
 */
export function fontSizeAtSelection(editor: Editor): number | null {
  const { selection, doc } = editor.state;
  const { from, to, empty, $from } = selection;
  if (empty) return effectiveFontPt($from.marks(), $from.parent);
  let size: number | null = null;
  let mixed = false;
  doc.nodesBetween(from, to, (node, pos) => {
    if (mixed) return false;
    if (node.isText) {
      const s = effectiveFontPt(node.marks, doc.resolve(pos).parent);
      if (size === null) size = s;
      else if (size !== s) mixed = true;
    }
    return true;
  });
  if (mixed) return null;
  return size ?? effectiveFontPt($from.marks(), $from.parent);
}
