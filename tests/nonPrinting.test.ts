import { beforeEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { buildExtensions } from '../src/editor/extensionsList';
import { buildNonPrintingDecorations, isNonPrintingEnabled } from '../src/editor/extensions/nonPrinting';

const ext = () => buildExtensions();
beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
});

describe('non-printing decorations (view-only)', () => {
  it('decorates spaces, tabs, nbsp, and hard breaks', () => {
    const e = new Editor({
      extensions: ext(),
      content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'a b\tc d' }, { type: 'hardBreak' }, { type: 'text', text: 'e' }] },
        ],
      },
    });
    const set = buildNonPrintingDecorations(e.state.doc);
    const found = set.find();
    // 1 space + 1 tab + 1 nbsp + 1 hard-break widget = 4.
    expect(found.length).toBe(4);
    e.destroy();
  });

  it('builds nothing meaningful for a doc with no whitespace/breaks', () => {
    const e = new Editor({ extensions: ext(), content: '<p>abc</p>' });
    expect(buildNonPrintingDecorations(e.state.doc).find().length).toBe(0);
    e.destroy();
  });
});

describe('toggle + persistence', () => {
  it('toggleNonPrinting flips state and persists', () => {
    const e = new Editor({ extensions: ext(), content: '<p>a b</p>' });
    expect(isNonPrintingEnabled(e)).toBe(false);
    e.commands.toggleNonPrinting();
    expect(isNonPrintingEnabled(e)).toBe(true);
    expect(localStorage.getItem('docs-editor:show-formatting')).toBe('true');
    e.commands.toggleNonPrinting();
    expect(isNonPrintingEnabled(e)).toBe(false);
    e.destroy();
  });

  it('initializes from the persisted preference', () => {
    localStorage.setItem('docs-editor:show-formatting', 'true');
    const e = new Editor({ extensions: ext(), content: '<p>a b</p>' });
    expect(isNonPrintingEnabled(e)).toBe(true);
    e.destroy();
  });
});

describe('never leaks into content/export', () => {
  it('getJSON / getHTML contain no glyphs whether on or off', () => {
    const e = new Editor({ extensions: ext(), content: '<p>a b c</p>' });
    e.commands.toggleNonPrinting(); // on
    const html = e.getHTML();
    const json = JSON.stringify(e.getJSON());
    for (const glyph of ['¶', '·', '→', '↵', '°']) {
      expect(html).not.toContain(glyph);
      expect(json).not.toContain(glyph);
    }
    e.destroy();
  });
});
