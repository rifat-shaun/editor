/**
 * Inactive-selection highlight: keeps the selection visible while the editor is
 * BLURRED (e.g. a toolbar dropdown's input took focus).
 *
 * When the editor is focused the browser's native selection is used as-is (see
 * `::selection` in styles.css) — full line-height, contiguous across lines. When
 * blurred, the browser stops painting it, so we render an inline decoration that
 * matches that native look (a plain full-line-height background → no gaps). The
 * selection itself always lives in `state.selection`, so editing is unaffected.
 */
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

const key = new PluginKey<boolean>('selectionHighlight'); // value = is the editor focused?

/** Inactive-selection decorations (only when blurred; null otherwise). Pure + testable. */
export function inactiveSelectionDecorations(state: EditorState, focused: boolean): DecorationSet | null {
  const sel = state.selection;
  if (focused || sel.empty || !(sel instanceof TextSelection)) return null;
  return DecorationSet.create(state.doc, [
    Decoration.inline(sel.from, sel.to, { class: 'pm-inactive-selection' }),
  ]);
}

export const SelectionHighlight = Extension.create({
  name: 'selectionHighlight',
  addProseMirrorPlugins() {
    return [
      new Plugin<boolean>({
        key,
        state: {
          init: () => false,
          apply: (tr, value) => {
            const meta = tr.getMeta(key);
            return typeof meta === 'boolean' ? meta : value;
          },
        },
        props: {
          decorations: (state) => inactiveSelectionDecorations(state, key.getState(state) === true),
          handleDOMEvents: {
            focus: (view) => {
              if (key.getState(view.state) !== true) view.dispatch(view.state.tr.setMeta(key, true));
              return false;
            },
            blur: (view) => {
              if (key.getState(view.state) !== false) view.dispatch(view.state.tr.setMeta(key, false));
              return false;
            },
          },
        },
      }),
    ];
  },
});
