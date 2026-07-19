import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { buildExtensions } from '../src/editor/extensionsList';

const p = (t: string) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] });
function makeEditor(content: object[]) {
  return new Editor({ extensions: buildExtensions(), content: { type: 'doc', content } });
}
const types = (e: Editor) => e.state.doc.content.content.map((n) => n.type.name);
function posOfText(e: Editor, text: string) {
  let at = 0;
  e.state.doc.descendants((n, pos) => {
    if (n.isText && n.text === text) at = pos;
  });
  return at;
}

describe('insertPageBreak command', () => {
  it('at the start of a block → inserts the break BEFORE it (no stray empty paragraph)', () => {
    const e = makeEditor([p('A'), p('B')]);
    e.commands.setTextSelection(posOfText(e, 'B'));
    e.commands.insertPageBreak();
    expect(types(e)).toEqual(['paragraph', 'pageBreak', 'paragraph']); // A | break | B
    e.destroy();
  });

  it('mid-block → splits at the caret (content after resumes on the next page)', () => {
    const e = makeEditor([p('AAAA'), p('B')]);
    e.commands.setTextSelection(posOfText(e, 'AAAA') + 2);
    e.commands.insertPageBreak();
    expect(types(e)).toEqual(['paragraph', 'pageBreak', 'paragraph', 'paragraph']);
    e.destroy();
  });

  it('at the very end of the doc → break + a paragraph to start the new page', () => {
    const e = makeEditor([p('A'), p('B')]);
    e.commands.setTextSelection(e.state.doc.content.size - 1);
    e.commands.insertPageBreak();
    expect(types(e)).toEqual(['paragraph', 'paragraph', 'pageBreak', 'paragraph']);
    e.destroy();
  });

  it('leaves a collapsed text cursor after the break (no node-selection outline / bubble menu)', () => {
    // start-of-block, mid-block, and doc-end all end collapsed + as TextSelection.
    const cases: Array<(e: Editor) => void> = [
      (e) => e.commands.setTextSelection(posOfText(e, 'B')),
      (e) => e.commands.setTextSelection(posOfText(e, 'AAAA') + 2),
      (e) => e.commands.setTextSelection(e.state.doc.content.size - 1),
    ];
    const contents = [
      [p('A'), p('B')],
      [p('AAAA'), p('B')],
      [p('A'), p('B')],
    ];
    cases.forEach((place, i) => {
      const e = makeEditor(contents[i]!);
      place(e);
      e.commands.insertPageBreak();
      expect(e.state.selection.empty).toBe(true); // collapsed → no bubble menu
      expect(e.state.selection.constructor.name).toBe('TextSelection'); // not NodeSelection → no outline
      e.destroy();
    });
  });

  it('the page-break is a real, persisted node (survives a JSON round-trip)', () => {
    const e = makeEditor([p('A'), p('B')]);
    e.commands.setTextSelection(posOfText(e, 'B'));
    e.commands.insertPageBreak();
    const json = e.getJSON();
    const reloaded = new Editor({ extensions: buildExtensions(), content: json });
    expect(types(reloaded)).toContain('pageBreak');
    reloaded.destroy();
    e.destroy();
  });
});
