/**
 * Paragraph spacing (Word's "Add/Remove Space Before/After Paragraph").
 *
 * Block-level, not a mark. Adds `spaceBefore` + `spaceAfter` attributes to the
 * text-bearing blocks (`paragraph` + `heading`) via `addGlobalAttributes` — the
 * same targets as `LineHeight`. Applying to a list item's paragraph writes an
 * INLINE margin that cleanly overrides the `li > p { margin: 0 }` reset (inline
 * wins), which matches Word (spacing applies inside lists too); the base
 * list-item gap is unaffected.
 *
 * Convention: POINTS, stored as "<n>pt" strings (Word-native; maps 1:1 to
 * export twips at ×20). Default null = inherit the base CSS spacing. The
 * Word-style "Add" amount is 12pt; "Remove" writes an explicit "0pt" so it
 * overrides the base bottom margin and visibly tightens.
 *
 * `renderHTML` emits only the sides that are set (`margin-top`/`margin-bottom`);
 * `parseHTML` reads them back from the element's INLINE style so pasted
 * Word/HTML round-trips (inline-only, so it never captures base CSS margins).
 *
 * Margin-collapsing caveat: CSS collapses adjacent vertical margins to the
 * larger; Word adds them. We accept CSS collapsing in the editor and export the
 * true before+after — a known minor divergence for two adjacent spaced blocks.
 */
import { Extension } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { EditorState, Transaction } from '@tiptap/pm/state';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    paragraphSpacing: {
      addSpaceBefore: () => ReturnType;
      removeSpaceBefore: () => ReturnType;
      addSpaceAfter: () => ReturnType;
      removeSpaceAfter: () => ReturnType;
      /** Explicit setter for the custom dialog. Omitting a side leaves it unchanged. */
      setParagraphSpacing: (spacing: { before?: string | number | null; after?: string | number | null }) => ReturnType;
    };
  }
}

/** Word's toggle adds 12pt. */
export const DEFAULT_SPACE_PT = 12;
export const PARAGRAPH_SPACING_TYPES = ['paragraph', 'heading'] as const;

/**
 * Normalize a spacing value to a stored "<n>pt" string, or `null` (unset).
 * Numbers are points; px/pt strings pass through (px→pt at 96dpi). Negatives /
 * garbage → null. Zero is kept ("0pt") — an explicit tightening override.
 */
export function normalizeSpacing(value: string | number | null | undefined): string | null {
  if (value == null || value === '') return null;
  let pt: number;
  if (typeof value === 'number') {
    pt = value;
  } else {
    const m = /^([\d.]+)(px|pt)?$/.exec(value.trim().toLowerCase());
    if (!m) return null;
    const n = parseFloat(m[1]!);
    if (!Number.isFinite(n)) return null;
    pt = m[2] === 'px' ? n * 0.75 : n;
  }
  if (!Number.isFinite(pt) || pt < 0) return null;
  return `${Math.round(Math.min(200, pt) * 100) / 100}pt`;
}

type CommandProps = { state: EditorState; tr: Transaction; dispatch?: (tr: Transaction) => void };

/** Set one or both spacing attrs on every text block in the selection. */
function applySpacing(patch: { spaceBefore?: string | null; spaceAfter?: string | null }) {
  return ({ state, tr, dispatch }: CommandProps) => {
    const { from, to } = state.selection;
    const types: readonly string[] = PARAGRAPH_SPACING_TYPES;
    let changed = false;
    state.doc.nodesBetween(from, to, (node: PMNode, pos: number) => {
      if (!types.includes(node.type.name)) return;
      const next = { ...node.attrs, ...patch };
      if (next.spaceBefore === node.attrs.spaceBefore && next.spaceAfter === node.attrs.spaceAfter) return;
      tr.setNodeMarkup(pos, undefined, next);
      changed = true;
    });
    if (changed && dispatch) dispatch(tr);
    return changed;
  };
}

export const ParagraphSpacing = Extension.create({
  name: 'paragraphSpacing',

  addOptions() {
    return { types: [...PARAGRAPH_SPACING_TYPES] as string[] };
  },

  addGlobalAttributes() {
    const attr = (side: 'marginTop' | 'marginBottom', cssProp: 'margin-top' | 'margin-bottom') => ({
      default: null as string | null,
      parseHTML: (element: HTMLElement) => normalizeSpacing(element.style[side] || null),
      renderHTML: (attributes: Record<string, unknown>) => {
        const key = cssProp === 'margin-top' ? 'spaceBefore' : 'spaceAfter';
        const value = attributes[key] as string | null;
        return value ? { style: `${cssProp}: ${value}` } : {};
      },
    });
    return [
      {
        types: this.options.types,
        attributes: {
          spaceBefore: attr('marginTop', 'margin-top'),
          spaceAfter: attr('marginBottom', 'margin-bottom'),
        },
      },
    ];
  },

  addCommands() {
    const dflt = `${DEFAULT_SPACE_PT}pt`;
    return {
      addSpaceBefore:
        () =>
        (props) =>
          applySpacing({ spaceBefore: dflt })(props),
      removeSpaceBefore:
        () =>
        (props) =>
          applySpacing({ spaceBefore: '0pt' })(props),
      addSpaceAfter:
        () =>
        (props) =>
          applySpacing({ spaceAfter: dflt })(props),
      removeSpaceAfter:
        () =>
        (props) =>
          applySpacing({ spaceAfter: '0pt' })(props),
      setParagraphSpacing:
        (spacing) =>
        (props) => {
          const patch: { spaceBefore?: string | null; spaceAfter?: string | null } = {};
          if ('before' in spacing) patch.spaceBefore = normalizeSpacing(spacing.before);
          if ('after' in spacing) patch.spaceAfter = normalizeSpacing(spacing.after);
          return applySpacing(patch)(props);
        },
    };
  },
});
