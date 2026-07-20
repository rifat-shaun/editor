import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { buildExtensions } from '../src/editor/extensionsList';
import { normalizeLineHeight } from '../src/editor/extensions/lineHeight';
import { lineHeightAtSelection, DEFAULT_LINE_HEIGHT } from '../src/components/lineHeightSelection';

function lineHeights(editor: Editor): (string | null)[] {
  const out: (string | null)[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'paragraph' || node.type.name === 'heading') {
      out.push((node.attrs.lineHeight as string | null) ?? null);
    }
    return true;
  });
  return out;
}

describe('normalizeLineHeight', () => {
  it('clamps unitless multipliers and strips trailing zeros', () => {
    expect(normalizeLineHeight('1.0')).toBe('1');
    expect(normalizeLineHeight('2.0')).toBe('2');
    expect(normalizeLineHeight(1.5)).toBe('1.5');
    expect(normalizeLineHeight('10')).toBe('4'); // clamped max
    expect(normalizeLineHeight('0.1')).toBe('0.5'); // clamped min
  });
  it('passes through explicit lengths', () => {
    expect(normalizeLineHeight('24px')).toBe('24px');
    expect(normalizeLineHeight('18PT')).toBe('18pt');
  });
  it('rejects garbage / unset', () => {
    expect(normalizeLineHeight(null)).toBeNull();
    expect(normalizeLineHeight('')).toBeNull();
    expect(normalizeLineHeight('abc')).toBeNull();
    expect(normalizeLineHeight('normal')).toBeNull();
    expect(normalizeLineHeight('-1')).toBeNull();
    expect(normalizeLineHeight('1.5rem-oops')).toBeNull();
  });
});

describe('LineHeight extension — parse / render round-trip', () => {
  it('parses inline line-height from HTML (paste path)', () => {
    const editor = new Editor({ extensions: buildExtensions() });
    editor.commands.setContent('<p style="line-height: 1.5">x</p>');
    expect(lineHeights(editor)).toEqual(['1.5']);
    editor.destroy();
  });
  it('renders line-height back to HTML (persist/print)', () => {
    const editor = new Editor({ extensions: buildExtensions() });
    editor.commands.setContent('<p style="line-height: 2">x</p>');
    expect(editor.getHTML()).toMatch(/line-height:\s*2/);
    editor.destroy();
  });
  it('does not force a value on blocks without one', () => {
    const editor = new Editor({ extensions: buildExtensions() });
    editor.commands.setContent('<p>plain</p>');
    expect(lineHeights(editor)).toEqual([null]);
    expect(editor.getHTML()).not.toMatch(/line-height/);
    editor.destroy();
  });
});

describe('LineHeight commands', () => {
  const doc = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Title' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'one' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'two' }] },
    ],
  };

  it('setLineHeight applies to the block at the caret', () => {
    const editor = new Editor({ extensions: buildExtensions(), content: doc });
    editor.commands.setTextSelection(2); // inside heading
    editor.commands.setLineHeight('1.5');
    expect(lineHeights(editor)).toEqual(['1.5', null, null]);
    editor.destroy();
  });

  it('applies to every block in a multi-block selection (heading + paragraphs)', () => {
    const editor = new Editor({ extensions: buildExtensions(), content: doc });
    editor.commands.setTextSelection({ from: 1, to: editor.state.doc.content.size - 1 });
    editor.commands.setLineHeight('2');
    expect(lineHeights(editor)).toEqual(['2', '2', '2']);
    editor.destroy();
  });

  it('select-all applies uniformly, and unset returns to default', () => {
    const editor = new Editor({ extensions: buildExtensions(), content: doc });
    editor.commands.selectAll();
    editor.commands.setLineHeight('1.15');
    expect(lineHeights(editor)).toEqual(['1.15', '1.15', '1.15']);
    editor.commands.unsetLineHeight();
    expect(lineHeights(editor)).toEqual([null, null, null]);
    editor.destroy();
  });

  it('undo/redo restores line-height state', () => {
    const editor = new Editor({ extensions: buildExtensions(), content: doc });
    editor.commands.selectAll();
    editor.commands.setLineHeight('1.5');
    expect(lineHeights(editor)).toEqual(['1.5', '1.5', '1.5']);
    editor.commands.undo();
    expect(lineHeights(editor)).toEqual([null, null, null]);
    editor.commands.redo();
    expect(lineHeights(editor)).toEqual(['1.5', '1.5', '1.5']);
    editor.destroy();
  });
});

describe('lineHeightAtSelection — reactive indicator read', () => {
  const doc = {
    type: 'doc',
    content: [
      { type: 'paragraph', attrs: { lineHeight: '1.5' }, content: [{ type: 'text', text: 'a' }] },
      { type: 'paragraph', attrs: { lineHeight: '2' }, content: [{ type: 'text', text: 'b' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'c' }] },
    ],
  };

  it('reports the shared value at the caret', () => {
    const editor = new Editor({ extensions: buildExtensions(), content: doc });
    editor.commands.setTextSelection(2); // in first paragraph
    expect(lineHeightAtSelection(editor)).toBe('1.5');
    editor.destroy();
  });

  it('reports DEFAULT for a block with no explicit value', () => {
    const editor = new Editor({ extensions: buildExtensions(), content: doc });
    editor.commands.setTextSelection(editor.state.doc.content.size - 1); // third paragraph
    expect(lineHeightAtSelection(editor)).toBe(DEFAULT_LINE_HEIGHT);
    editor.destroy();
  });

  it('returns null (placeholder) for a mixed selection', () => {
    const editor = new Editor({ extensions: buildExtensions(), content: doc });
    editor.commands.selectAll();
    expect(lineHeightAtSelection(editor)).toBeNull();
    editor.destroy();
  });
});
