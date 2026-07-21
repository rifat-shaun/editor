/**
 * Paragraph indentation — the attributes behind the ruler's indent markers and
 * the Format → Align & indent menu. Block-level, on `paragraph` + `heading`.
 *
 * Model (all CSS px @96dpi — the pagination/page-geometry unit; ×15 → DOCX
 * twips, × zoom → screen):
 *   - `indentLeft`  → margin-left   (left edge of the block)
 *   - `indentRight` → margin-right  (right edge)
 *   - `indentFirstLine` → text-indent, SIGNED: positive = first-line indent,
 *     negative = hanging indent (first line at left, rest indented by |value|).
 *
 * Word's four ruler markers map onto these: left rectangle = `indentLeft`;
 * first-line triangle = `indentLeft + indentFirstLine`; hanging triangle =
 * `indentLeft`; right triangle = `indentRight`.
 *
 * `renderHTML`/`parseHTML` emit/read inline styles so indents persist and
 * export; the DOCX engine maps them to Word indentation twips.
 */
import { Extension } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { EditorState, Transaction } from '@tiptap/pm/state';

export interface IndentPatch {
  left?: number;
  right?: number;
  firstLine?: number;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    indent: {
      setParagraphIndent: (patch: IndentPatch) => ReturnType;
      indentMore: () => ReturnType;
      indentLess: () => ReturnType;
      unsetIndent: () => ReturnType;
    };
  }
}

/** One indent step = 0.5in. */
export const INDENT_STEP = 48;
export const INDENT_TYPES = ['paragraph', 'heading'] as const;
const MAX_INDENT = 96 * 10; // 10in guard

const px = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};
const clampLeftRight = (n: number) => Math.max(0, Math.min(MAX_INDENT, Math.round(n)));
const clampFirst = (n: number) => Math.max(-MAX_INDENT, Math.min(MAX_INDENT, Math.round(n)));

type CommandProps = { state: EditorState; tr: Transaction; dispatch?: (tr: Transaction) => void };

function applyIndent(map: (attrs: Record<string, unknown>) => IndentPatch) {
  return ({ state, tr, dispatch }: CommandProps) => {
    const { from, to } = state.selection;
    const types: readonly string[] = INDENT_TYPES;
    let changed = false;
    state.doc.nodesBetween(from, to, (node: PMNode, pos: number) => {
      if (!types.includes(node.type.name)) return;
      const patch = map(node.attrs);
      const next = { ...node.attrs };
      if (patch.left !== undefined) next.indentLeft = clampLeftRight(patch.left);
      if (patch.right !== undefined) next.indentRight = clampLeftRight(patch.right);
      if (patch.firstLine !== undefined) next.indentFirstLine = clampFirst(patch.firstLine);
      if (
        next.indentLeft === node.attrs.indentLeft &&
        next.indentRight === node.attrs.indentRight &&
        next.indentFirstLine === node.attrs.indentFirstLine
      )
        return;
      tr.setNodeMarkup(pos, undefined, next);
      changed = true;
    });
    if (changed && dispatch) dispatch(tr);
    return changed;
  };
}

const styleAttr = (key: 'indentLeft' | 'indentRight' | 'indentFirstLine', cssProp: string) => ({
  default: 0,
  parseHTML: (el: HTMLElement) => {
    const raw = cssProp === 'margin-left' ? el.style.marginLeft : cssProp === 'margin-right' ? el.style.marginRight : el.style.textIndent;
    return raw && raw.endsWith('px') ? Math.round(parseFloat(raw)) || 0 : 0;
  },
  renderHTML: (attrs: Record<string, unknown>) => {
    const v = px(attrs[key]);
    return v ? { style: `${cssProp}: ${v}px` } : {};
  },
});

export const Indent = Extension.create({
  name: 'indent',
  addOptions() {
    return { types: [...INDENT_TYPES] as string[] };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          indentLeft: styleAttr('indentLeft', 'margin-left'),
          indentRight: styleAttr('indentRight', 'margin-right'),
          indentFirstLine: styleAttr('indentFirstLine', 'text-indent'),
        },
      },
    ];
  },
  addKeyboardShortcuts() {
    return {
      'Mod-]': () => this.editor.commands.indentMore(),
      'Mod-[': () => this.editor.commands.indentLess(),
    };
  },
  addCommands() {
    return {
      setParagraphIndent:
        (patch) =>
        (props) =>
          applyIndent(() => patch)(props),
      indentMore:
        () =>
        (props) =>
          applyIndent((a) => ({ left: px(a.indentLeft) + INDENT_STEP }))(props),
      indentLess:
        () =>
        (props) =>
          applyIndent((a) => ({ left: px(a.indentLeft) - INDENT_STEP }))(props),
      unsetIndent:
        () =>
        (props) =>
          applyIndent(() => ({ left: 0, right: 0, firstLine: 0 }))(props),
    };
  },
});
