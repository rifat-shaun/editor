import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { buildExtensions } from '../src/editor/extensionsList';
import { fontSizeAtSelection } from '../src/components/fontSizeSelection';

function editorWith(content: object) {
  return new Editor({ extensions: buildExtensions(), content });
}
const text = (t: string, size?: string) => ({
  type: 'text',
  text: t,
  ...(size ? { marks: [{ type: 'textStyle', attrs: { fontSize: size } }] } : {}),
});

describe('fontSizeAtSelection — toolbar indicator (points)', () => {
  it('reflects an explicit pt fontSize mark at a collapsed caret', () => {
    const ed = editorWith({ type: 'doc', content: [{ type: 'paragraph', content: [text('big', '24pt')] }] });
    ed.commands.setTextSelection(2); // inside "big"
    expect(fontSizeAtSelection(ed)).toBe(24);
    ed.destroy();
  });

  it('interprets an imported px mark as visual-parity pt (24px → 18pt)', () => {
    const ed = editorWith({ type: 'doc', content: [{ type: 'paragraph', content: [text('pasted', '24px')] }] });
    ed.commands.setTextSelection(2);
    expect(fontSizeAtSelection(ed)).toBe(18);
    ed.destroy();
  });

  it('reflects a heading level size in pt when there is no mark', () => {
    const ed = editorWith({
      type: 'doc',
      content: [{ type: 'heading', attrs: { level: 1 }, content: [text('Title')] }],
    });
    ed.commands.setTextSelection(2);
    expect(fontSizeAtSelection(ed)).toBe(21); // h1 (28px → 21pt), not 12
    const ed2 = editorWith({
      type: 'doc',
      content: [{ type: 'heading', attrs: { level: 3 }, content: [text('Sub')] }],
    });
    ed2.commands.setTextSelection(2);
    expect(fontSizeAtSelection(ed2)).toBe(15); // h3
    ed.destroy();
    ed2.destroy();
  });

  it('falls back to the base size (12pt) for plain body text', () => {
    const ed = editorWith({ type: 'doc', content: [{ type: 'paragraph', content: [text('plain')] }] });
    ed.commands.setTextSelection(2);
    expect(fontSizeAtSelection(ed)).toBe(12);
    ed.destroy();
  });

  it('returns null (placeholder) for a selection spanning mixed sizes', () => {
    const ed = editorWith({
      type: 'doc',
      content: [{ type: 'paragraph', content: [text('AAA', '12pt'), text('BBB', '20pt')] }],
    });
    ed.commands.setTextSelection({ from: 1, to: 7 }); // across both runs
    expect(fontSizeAtSelection(ed)).toBeNull();
    ed.destroy();
  });

  it('is consistent (single value) across a selection of one size', () => {
    const ed = editorWith({
      type: 'doc',
      content: [{ type: 'paragraph', content: [text('same', '18pt')] }],
    });
    ed.commands.setTextSelection({ from: 1, to: 5 });
    expect(fontSizeAtSelection(ed)).toBe(18);
    ed.destroy();
  });
});
