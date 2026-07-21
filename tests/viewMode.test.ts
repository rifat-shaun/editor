import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { buildExtensions } from '../src/editor/extensionsList';
import { READ_ONLY_BYPASS } from '../src/editor/extensions/readOnlyGuard';
import { commandEditsDoc, isItemEnabled, type CmdCtx } from '../src/menus/registry';

function makeEditor(editable: boolean): Editor {
  return new Editor({ extensions: buildExtensions(), content: '<p>Hello world</p>', editable });
}

/** Select the paragraph's text ("Hello world"). */
function selectText(editor: Editor) {
  editor.commands.setTextSelection({ from: 1, to: editor.state.doc.nodeAt(0)!.nodeSize - 1 });
}

function hasMark(editor: Editor, mark: string): boolean {
  let found = false;
  editor.state.doc.descendants((n) => {
    if (n.isText && n.marks.some((m) => m.type.name === mark)) found = true;
  });
  return found;
}

const text = (editor: Editor) => editor.state.doc.textContent;

describe('edit mode (editable)', () => {
  it('applies bold / italic to the selection', () => {
    const editor = makeEditor(true);
    selectText(editor);
    editor.chain().toggleBold().run();
    editor.chain().toggleItalic().run();
    expect(hasMark(editor, 'bold')).toBe(true);
    expect(hasMark(editor, 'italic')).toBe(true);
    editor.destroy();
  });

  it('allows typing / insert + delete', () => {
    const editor = makeEditor(true);
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    editor.commands.insertContent('!!');
    expect(text(editor)).toBe('Hello world!!');
    editor.destroy();
  });

  it('selection changes are allowed (docChanged=false)', () => {
    const editor = makeEditor(true);
    expect(editor.commands.setTextSelection({ from: 1, to: 3 })).toBe(true);
    editor.destroy();
  });
});

describe('view mode (not editable)', () => {
  it('does NOT apply bold when a toolbar/keyboard command runs', () => {
    const editor = makeEditor(false);
    selectText(editor);
    editor.chain().toggleBold().run();
    expect(hasMark(editor, 'bold')).toBe(false);
    editor.destroy();
  });

  it('does NOT apply italic / underline / strike', () => {
    const editor = makeEditor(false);
    selectText(editor);
    editor.chain().toggleItalic().run();
    editor.chain().toggleUnderline().run();
    editor.chain().toggleStrike().run();
    expect(hasMark(editor, 'italic')).toBe(false);
    expect(hasMark(editor, 'underline')).toBe(false);
    expect(hasMark(editor, 'strike')).toBe(false);
    editor.destroy();
  });

  it('blocks insert / delete (document is unchanged)', () => {
    const editor = makeEditor(false);
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    editor.commands.insertContent('XYZ');
    selectText(editor);
    editor.commands.deleteSelection();
    expect(text(editor)).toBe('Hello world');
    editor.destroy();
  });

  it('still allows selection changes (read-only, not frozen)', () => {
    const editor = makeEditor(false);
    editor.commands.setTextSelection({ from: 1, to: 3 });
    expect(editor.state.selection.from).toBe(1);
    expect(editor.state.selection.to).toBe(3);
    editor.destroy();
  });

  it('a readOnlyBypass transaction is allowed through (programmatic writes)', () => {
    const editor = makeEditor(false);
    selectText(editor);
    editor.view.dispatch(
      editor.state.tr.addMark(1, 3, editor.schema.marks.bold!.create()).setMeta(READ_ONLY_BYPASS, true),
    );
    expect(hasMark(editor, 'bold')).toBe(true);
    editor.destroy();
  });
});

describe('menu: view-mode disables editing commands', () => {
  it('commandEditsDoc classifies commands correctly', () => {
    // edits the document → blocked in view mode
    for (const id of [
      'format.bold',
      'style.h1',
      'align.left',
      'spacing.line.1.5',
      'list.numbered',
      'table.addRow',
      'insert.table',
      'insert.link',
      'edit.undo',
      'edit.cut',
      'edit.paste',
      'file.rename',
      'file.pageSetup',
    ]) {
      expect(commandEditsDoc(id)).toBe(true);
    }
    // read-only / navigation → allowed in view mode
    for (const id of [
      'edit.copy',
      'edit.selectAll',
      'view.darkMode',
      'view.showOutline',
      'view.zoom.150',
      'download.docx',
      'file.print',
      'tools.wordCount',
    ]) {
      expect(commandEditsDoc(id)).toBe(false);
    }
  });

  it('isItemEnabled: editing commands disabled in view mode, enabled in edit mode', () => {
    const editor = makeEditor(false);
    const ctx = (mode: 'editing' | 'viewing'): CmdCtx =>
      ({ editor, ui: { mode }, svc: {} } as unknown as CmdCtx);

    // Editing commands: off when viewing, on when editing.
    for (const id of ['format.bold', 'insert.table', 'file.pageSetup', 'align.left']) {
      expect(isItemEnabled(id, ctx('viewing'))).toBe(false);
      expect(isItemEnabled(id, ctx('editing'))).toBe(true);
    }
    // Read-only commands stay enabled in both modes.
    for (const id of ['view.darkMode', 'edit.copy', 'download.docx', 'tools.wordCount']) {
      expect(isItemEnabled(id, ctx('viewing'))).toBe(true);
      expect(isItemEnabled(id, ctx('editing'))).toBe(true);
    }
    editor.destroy();
  });
});

describe('mode transitions', () => {
  it('setEditable(false) then a command → no change; setEditable(true) → change applies', () => {
    const editor = makeEditor(true);
    editor.setEditable(false);
    selectText(editor);
    editor.chain().toggleBold().run();
    expect(hasMark(editor, 'bold')).toBe(false);

    editor.setEditable(true);
    selectText(editor);
    editor.chain().toggleBold().run();
    expect(hasMark(editor, 'bold')).toBe(true);
    editor.destroy();
  });
});
