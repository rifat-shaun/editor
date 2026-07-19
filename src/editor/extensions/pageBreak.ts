/**
 * An explicit, authored page break — a real document node (persists in getJSON()
 * and exports to Word as a hard break). The pagination engine treats it as a
 * FORCED break (see collectBreakUnits/computeBreaks): the content after it starts
 * at the top of the next page using the engine's normal page frame + gap.
 *
 * It therefore renders NO in-flow separator: the node itself is a zero-height,
 * invisible marker (the visible boundary is the engine's page gap). A subtle
 * outline shows only when the node is selected, so it stays deletable.
 */
import { Node, mergeAttributes, type CommandProps } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pageBreak: {
      insertPageBreak: () => ReturnType;
    };
  }
}

export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  parseHTML() {
    return [{ tag: 'div[data-page-break]' }];
  },

  renderHTML() {
    // No in-flow content — an invisible marker; the page gap is the visual.
    return [
      'div',
      mergeAttributes({ 'data-page-break': 'true', class: 'pgn-page-break', contenteditable: 'false' }),
    ];
  },

  addCommands() {
    return {
      insertPageBreak:
        () =>
        ({ state, chain, editor }) => {
          const { $from, empty } = state.selection;
          const atDocEnd = state.selection.to >= state.doc.content.size - 1;
          // Drop a collapsed TEXT cursor into the content AFTER the break so the
          // break node isn't left selected — otherwise it shows a selected-node
          // outline and pops the floating (AI) toolbar.
          const placeCaretAfterBreak = ({ tr, dispatch }: CommandProps) => {
            if (dispatch) {
              const to = Math.min(tr.selection.to, tr.doc.content.size);
              tr.setSelection(TextSelection.near(tr.doc.resolve(to), 1)).scrollIntoView();
            }
            return true;
          };

          // At the very end of the document there is no following block to push
          // down, so add an empty paragraph (which becomes the new page). At the
          // start of a block, insert the break BEFORE it (no stray empty
          // paragraph). Otherwise split mid-block (Word-like).
          const c =
            atDocEnd
              ? chain().insertContent([{ type: 'pageBreak' }, { type: 'paragraph' }])
              : empty && $from.parentOffset === 0
                ? chain().insertContentAt($from.before(), { type: 'pageBreak' })
                : chain().insertContent({ type: 'pageBreak' });
          const ok = c.command(placeCaretAfterBreak).run();

          // The pagination engine inserts the page fill AFTER this transaction
          // (async), which pushes the caret down to the new page. Repaginate now,
          // then scroll the caret — on the fresh page — into view.
          if (ok) {
            editor.storage.pagination?.recompute?.(true);
            if (typeof requestAnimationFrame !== 'undefined') {
              requestAnimationFrame(() =>
                requestAnimationFrame(() => editor.commands.scrollIntoView()),
              );
            }
          }
          return ok;
        },
    };
  },
});
