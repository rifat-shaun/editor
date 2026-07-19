import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { buildExtensions } from '../src/editor/extensionsList';
import { inactiveSelectionDecorations } from '../src/editor/extensions/selectionHighlight';

function makeEditor() {
  return new Editor({
    extensions: buildExtensions(),
    content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello world' }] }] },
  });
}

describe('inactive-selection highlight (blurred → matches native selection)', () => {
  it('decorates a range selection when blurred', () => {
    const ed = makeEditor();
    ed.commands.setTextSelection({ from: 1, to: 6 }); // "hello"
    const decos = inactiveSelectionDecorations(ed.state, false);
    expect(decos).not.toBeNull();
    expect(decos!.find(1, 6)).toHaveLength(1);
    ed.destroy();
  });

  it('no decoration when focused (native selection paints it)', () => {
    const ed = makeEditor();
    ed.commands.setTextSelection({ from: 1, to: 6 });
    expect(inactiveSelectionDecorations(ed.state, true)).toBeNull();
    ed.destroy();
  });

  it('no decoration for a collapsed caret', () => {
    const ed = makeEditor();
    ed.commands.setTextSelection(3);
    expect(inactiveSelectionDecorations(ed.state, false)).toBeNull();
    ed.destroy();
  });

  it('no decoration for a non-text (node) selection', () => {
    const ed = makeEditor();
    ed.commands.insertContentAt(ed.state.doc.content.size, { type: 'pageBreak' });
    let pos = 0;
    ed.state.doc.descendants((n, p) => { if (n.type.name === 'pageBreak') pos = p; });
    ed.view.dispatch(ed.state.tr.setSelection(NodeSelection.create(ed.state.doc, pos)));
    expect(inactiveSelectionDecorations(ed.state, false)).toBeNull();
    ed.destroy();
  });
});
