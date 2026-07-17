import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { buildExtensions } from '../src/editor/extensionsList';

function firstFontSize(editor: Editor): string | null {
  let size: string | null = null;
  editor.state.doc.descendants((node) => {
    if (node.isText) {
      for (const m of node.marks) {
        if (m.type.name === 'textStyle' && m.attrs.fontSize) size = m.attrs.fontSize as string;
      }
    }
    return true;
  });
  return size;
}

describe('FontSize — pasted/loaded font sizes', () => {
  it('captures inline font-size from parsed HTML (the paste path)', () => {
    const editor = new Editor({ extensions: buildExtensions() });
    editor.commands.setContent('<p>a <span style="font-size: 22px">big</span></p>');
    expect(firstFontSize(editor)).toBe('22px');
    editor.destroy();
  });

  it('preserves non-px units (e.g. Word pt)', () => {
    const editor = new Editor({ extensions: buildExtensions() });
    editor.commands.setContent('<p><span style="font-size: 20pt">twenty</span></p>');
    expect(firstFontSize(editor)).toBe('20pt');
    editor.destroy();
  });

  it('round-trips through HTML export', () => {
    const editor = new Editor({ extensions: buildExtensions() });
    editor.commands.setContent('<p><span style="font-size: 13px">x</span></p>');
    expect(editor.getHTML()).toMatch(/font-size:\s*13px/);
    editor.destroy();
  });

  it('setFontSize / unsetFontSize commands work on a selection', () => {
    const editor = new Editor({
      extensions: buildExtensions(),
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }] },
    });
    editor.commands.setTextSelection({ from: 1, to: 6 });
    editor.commands.setFontSize('30px');
    expect(firstFontSize(editor)).toBe('30px');
    editor.commands.unsetFontSize();
    expect(firstFontSize(editor)).toBeNull();
    editor.destroy();
  });
});
