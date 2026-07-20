import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { buildExtensions } from '../src/editor/extensionsList';
import { normalizeSpacing } from '../src/editor/extensions/paragraphSpacing';
import { paragraphSpacingAtSelection, hasSpace, MIXED } from '../src/components/paragraphSpacingSelection';

type SP = { before: string | null; after: string | null };
function spacings(editor: Editor): SP[] {
  const out: SP[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'paragraph' || node.type.name === 'heading') {
      out.push({
        before: (node.attrs.spaceBefore as string | null) ?? null,
        after: (node.attrs.spaceAfter as string | null) ?? null,
      });
    }
    return true;
  });
  return out;
}

describe('normalizeSpacing', () => {
  it('normalizes points and keeps explicit zero', () => {
    expect(normalizeSpacing(12)).toBe('12pt');
    expect(normalizeSpacing('12pt')).toBe('12pt');
    expect(normalizeSpacing('0pt')).toBe('0pt');
    expect(normalizeSpacing('16px')).toBe('12pt'); // 16px → 12pt
    expect(normalizeSpacing(500)).toBe('200pt'); // clamped max
  });
  it('rejects unset/negative/garbage', () => {
    expect(normalizeSpacing(null)).toBeNull();
    expect(normalizeSpacing('')).toBeNull();
    expect(normalizeSpacing(-3)).toBeNull();
    expect(normalizeSpacing('abc')).toBeNull();
    expect(normalizeSpacing('12em')).toBeNull();
  });
});

describe('ParagraphSpacing — parse / render round-trip', () => {
  it('parses inline margins from HTML (paste path)', () => {
    const editor = new Editor({ extensions: buildExtensions() });
    editor.commands.setContent('<p style="margin-top: 12pt; margin-bottom: 6pt">x</p>');
    expect(spacings(editor)).toEqual([{ before: '12pt', after: '6pt' }]);
    editor.destroy();
  });
  it('renders set sides back to HTML, omitting unset ones', () => {
    const editor = new Editor({ extensions: buildExtensions() });
    editor.commands.setContent('<p style="margin-bottom: 18pt">x</p>');
    const html = editor.getHTML();
    expect(html).toMatch(/margin-bottom:\s*18pt/);
    expect(html).not.toMatch(/margin-top/);
    editor.destroy();
  });
  it('does not stamp spacing on blocks without it', () => {
    const editor = new Editor({ extensions: buildExtensions() });
    editor.commands.setContent('<p>plain</p>');
    expect(spacings(editor)).toEqual([{ before: null, after: null }]);
    editor.destroy();
  });
});

describe('ParagraphSpacing commands', () => {
  const doc = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Title' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'one' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'two' }] },
    ],
  };

  it('addSpaceBefore/After apply the 12pt default at the caret', () => {
    const editor = new Editor({ extensions: buildExtensions(), content: doc });
    editor.commands.setTextSelection(2); // in heading
    editor.commands.addSpaceBefore();
    editor.commands.addSpaceAfter();
    expect(spacings(editor)[0]).toEqual({ before: '12pt', after: '12pt' });
    editor.destroy();
  });

  it('removeSpaceBefore/After write an explicit 0pt (tighten override)', () => {
    const editor = new Editor({ extensions: buildExtensions(), content: doc });
    editor.commands.setTextSelection(2);
    editor.commands.removeSpaceAfter();
    expect(spacings(editor)[0]?.after).toBe('0pt');
    editor.destroy();
  });

  it('applies to every block in a multi-block selection', () => {
    const editor = new Editor({ extensions: buildExtensions(), content: doc });
    editor.commands.setTextSelection({ from: 1, to: editor.state.doc.content.size - 1 });
    editor.commands.addSpaceBefore();
    expect(spacings(editor).map((s) => s.before)).toEqual(['12pt', '12pt', '12pt']);
    editor.destroy();
  });

  it('setParagraphSpacing sets explicit values on select-all; undo/redo works', () => {
    const editor = new Editor({ extensions: buildExtensions(), content: doc });
    editor.commands.selectAll();
    editor.commands.setParagraphSpacing({ before: 6, after: 18 });
    expect(spacings(editor)).toEqual([
      { before: '6pt', after: '18pt' },
      { before: '6pt', after: '18pt' },
      { before: '6pt', after: '18pt' },
    ]);
    editor.commands.undo();
    expect(spacings(editor).every((s) => s.before === null && s.after === null)).toBe(true);
    editor.commands.redo();
    expect(spacings(editor)[1]).toEqual({ before: '6pt', after: '18pt' });
    editor.destroy();
  });

  it('setParagraphSpacing leaves an omitted side unchanged', () => {
    const editor = new Editor({ extensions: buildExtensions(), content: doc });
    editor.commands.selectAll();
    editor.commands.setParagraphSpacing({ after: 10 });
    expect(spacings(editor)[1]).toEqual({ before: null, after: '10pt' });
    editor.commands.setParagraphSpacing({ before: 4 });
    expect(spacings(editor)[1]).toEqual({ before: '4pt', after: '10pt' });
    editor.destroy();
  });
});

describe('paragraphSpacingAtSelection — reactive Add/Remove read', () => {
  const doc = {
    type: 'doc',
    content: [
      { type: 'paragraph', attrs: { spaceBefore: '12pt', spaceAfter: '0pt' }, content: [{ type: 'text', text: 'a' }] },
      { type: 'paragraph', attrs: { spaceBefore: '6pt' }, content: [{ type: 'text', text: 'b' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'c' }] },
    ],
  };

  it('reports the block values at the caret and hasSpace flips correctly', () => {
    const editor = new Editor({ extensions: buildExtensions(), content: doc });
    editor.commands.setTextSelection(2); // first paragraph
    const s = paragraphSpacingAtSelection(editor);
    expect(s).toEqual({ before: '12pt', after: '0pt' });
    expect(hasSpace(s.before)).toBe(true); // 12pt → Remove
    expect(hasSpace(s.after)).toBe(false); // explicit 0pt → Add
    editor.destroy();
  });

  it('unset block → null (Add)', () => {
    const editor = new Editor({ extensions: buildExtensions(), content: doc });
    editor.commands.setTextSelection(editor.state.doc.content.size - 1); // third paragraph
    const s = paragraphSpacingAtSelection(editor);
    expect(s).toEqual({ before: null, after: null });
    expect(hasSpace(s.before)).toBe(false);
    editor.destroy();
  });

  it('mixed selection → MIXED sentinel (neutral)', () => {
    const editor = new Editor({ extensions: buildExtensions(), content: doc });
    editor.commands.selectAll();
    const s = paragraphSpacingAtSelection(editor);
    expect(s.before).toBe(MIXED);
    expect(hasSpace(s.before)).toBe(false); // neutral → Add
    editor.destroy();
  });
});
