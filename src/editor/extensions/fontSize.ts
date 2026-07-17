/**
 * Font size support.
 *
 * The editor had `TextStyle` but nothing that parsed/rendered `font-size`, so a
 * pasted `<span style="font-size:24px">` lost its size and fell back to the
 * document's inherited 16px. This adds a `fontSize` attribute to the `textStyle`
 * mark: `parseHTML` pulls it from the element's inline style (so pasted/imported
 * sizes are preserved), `renderHTML` writes it back (so it round-trips and
 * exports), and the commands let the toolbar set it per selection.
 */
import { Extension } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (size: string) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
  }
}

export const FontSize = Extension.create({
  name: 'fontSize',

  addOptions() {
    return { types: ['textStyle'] };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null as string | null,
            // Capture the size from pasted/loaded content (any unit: px, pt, em…).
            parseHTML: (element: HTMLElement) => element.style.fontSize || null,
            renderHTML: (attributes: Record<string, unknown>) =>
              attributes.fontSize ? { style: `font-size: ${attributes.fontSize as string}` } : {},
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setFontSize:
        (size: string) =>
        ({ chain }) =>
          chain().setMark('textStyle', { fontSize: size }).run(),
      unsetFontSize:
        () =>
        ({ chain }) =>
          chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
    };
  },
});
