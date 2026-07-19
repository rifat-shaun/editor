/**
 * An explicit, authored page break. This is a real document node (unlike the
 * decoration-based auto-pagination, which is view-only and never serializes), so
 * it round-trips in getJSON() and exports to Word as a hard page break.
 *
 * NOTE: the on-screen pagination engine flows content automatically; this node
 * renders a visible "Page break" marker but does not itself force the on-screen
 * page boundary (a separate pagination-engine change). Its purpose is authored
 * breaks that survive export.
 */
import { Node, mergeAttributes } from '@tiptap/core';

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
    return [
      'div',
      mergeAttributes({ 'data-page-break': 'true', class: 'pgn-page-break', contenteditable: 'false' }),
      ['span', { class: 'pgn-page-break-label' }, 'Page break'],
    ];
  },

  addCommands() {
    return {
      insertPageBreak:
        () =>
        ({ chain }) =>
          // Insert the break and a paragraph after it so the cursor has a home.
          chain().insertContent([{ type: 'pageBreak' }, { type: 'paragraph' }]).run(),
    };
  },
});
