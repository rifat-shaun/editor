/**
 * Line-height (line-spacing) support.
 *
 * Line height is a BLOCK attribute, not a mark. This adds a `lineHeight`
 * attribute to the text-bearing block nodes (`paragraph` + `heading`) via
 * `addGlobalAttributes`. We target the text blocks rather than `listItem`
 * because list items and blockquotes contain paragraphs, so this covers their
 * content automatically while leaving the list-item margin / `li > p` spacing
 * work untouched (line height and inter-item margin are different things) and
 * keeping list markers — rendered on the `<li>` — aligned.
 *
 * Convention: UNITLESS multipliers ("1", "1.15", "1.5", "2"). Unitless scales
 * with font size and maps cleanly to Word (AUTO, line = mult × 240). An
 * explicit CSS length ("24px"/"18pt") is also accepted for imported/custom
 * values and maps to Word EXACT.
 *
 * `parseHTML` reads `element.style.lineHeight` so pasted Word/HTML content
 * round-trips; `renderHTML` writes it back so it persists (JSON keeps the attr)
 * and prints (inline style survives the print-layout clone). Default `null` →
 * inherit the editor's base line-height (no value forced on every block).
 */
import { Extension } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { EditorState, Transaction } from '@tiptap/pm/state';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    lineHeight: {
      /** Apply to every text block in the selection (or the block at the caret). */
      setLineHeight: (value: string | number) => ReturnType;
      /** Remove the attribute → back to the inherited default. */
      unsetLineHeight: () => ReturnType;
    };
  }
}

/**
 * Normalize a user/imported line-height value to a stored string, or `null` if
 * it's unset/garbage. Unitless multipliers are clamped to a sane [0.5, 4];
 * explicit px/pt lengths pass through (trimmed, lower-cased unit).
 */
export function normalizeLineHeight(value: string | number | null | undefined): string | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null;
    return String(Math.min(4, Math.max(0.5, value)));
  }
  const raw = value.trim().toLowerCase();
  if (raw === 'normal' || raw === 'inherit') return null;
  const len = /^([\d.]+)(px|pt|em|rem)$/.exec(raw);
  if (len) {
    const n = parseFloat(len[1]!);
    return Number.isFinite(n) && n > 0 ? `${n}${len[2]}` : null;
  }
  const mult = parseFloat(raw);
  if (!Number.isFinite(mult) || mult <= 0) return null;
  // A bare number with no unit is a unitless multiplier.
  return /^[\d.]+$/.test(raw) ? String(Math.min(4, Math.max(0.5, mult))) : null;
}

export const LINE_HEIGHT_TYPES = ['paragraph', 'heading'] as const;

export const LineHeight = Extension.create({
  name: 'lineHeight',

  addOptions() {
    return { types: [...LINE_HEIGHT_TYPES] as string[] };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          lineHeight: {
            default: null as string | null,
            parseHTML: (element: HTMLElement) => normalizeLineHeight(element.style.lineHeight || null),
            renderHTML: (attributes: Record<string, unknown>) =>
              attributes.lineHeight ? { style: `line-height: ${attributes.lineHeight as string}` } : {},
          },
        },
      },
    ];
  },

  addCommands() {
    const types = this.options.types;
    const applyToBlocks = (value: string | null) =>
      ({ state, tr, dispatch }: { state: EditorState; tr: Transaction; dispatch?: (tr: Transaction) => void }) => {
        const { from, to } = state.selection;
        let changed = false;
        state.doc.nodesBetween(from, to, (node: PMNode, pos: number) => {
          if (!types.includes(node.type.name)) return;
          if (node.attrs.lineHeight === value) return;
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, lineHeight: value });
          changed = true;
        });
        if (changed && dispatch) dispatch(tr);
        return changed;
      };

    return {
      setLineHeight:
        (value: string | number) =>
        (props) =>
          applyToBlocks(normalizeLineHeight(value))(props),
      unsetLineHeight:
        () =>
        (props) =>
          applyToBlocks(null)(props),
    };
  },
});
