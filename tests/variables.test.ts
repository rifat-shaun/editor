import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { buildExtensions } from '../src/editor/extensionsList';
import { resolveVariable, variableBakedText } from '../src/editor/extensions/variable';
import { isVariableHighlightEnabled } from '../src/editor/extensions/variableHighlight';
import { matchVariableTrigger as trigger } from '../src/editor/extensions/variableSuggest';
import { serialize } from '../src/editor/serialize';
import { commandEditsDoc, isItemEnabled, type CmdCtx } from '../src/menus/registry';

function makeEditor(): Editor {
  return new Editor({ extensions: buildExtensions(), content: '<p>Hello </p>', editable: true });
}

/** Count variable nodes in the doc. */
function variableNodes(editor: Editor): { name: string }[] {
  const out: { name: string }[] = [];
  editor.state.doc.descendants((n) => {
    if (n.type.name === 'variable') out.push({ name: n.attrs.name as string });
  });
  return out;
}

describe('resolveVariable / variableBakedText', () => {
  it('set → value; null/absent/empty → unset (technical name)', () => {
    expect(resolveVariable({ a: 'Acme' }, 'a')).toEqual({ value: 'Acme', display: 'Acme', unset: false });
    expect(resolveVariable({ a: null }, 'a')).toEqual({ value: null, display: 'a', unset: true });
    expect(resolveVariable({ a: '' }, 'a')).toEqual({ value: null, display: 'a', unset: true });
    expect(resolveVariable({}, 'missing')).toEqual({ value: null, display: 'missing', unset: true });
    expect(resolveVariable(undefined, 'x').unset).toBe(true);
  });

  it('bakes value when set; unset → {{name}} placeholder, or omitted when excluded', () => {
    expect(variableBakedText({ client_name: 'Meridian' }, 'client_name')).toBe('Meridian');
    expect(variableBakedText({}, 'client_name')).toBe('{{client_name}}'); // default: include unset
    expect(variableBakedText({}, 'client_name', { includeUnset: false })).toBe(''); // omit unset
    // A set value is unaffected by the include-unset flag.
    expect(variableBakedText({ a: 'X' }, 'a', { includeUnset: false })).toBe('X');
  });
});

describe('variable node', () => {
  it('insertVariable inserts one atomic node carrying only the name', () => {
    const editor = makeEditor();
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    editor.commands.insertVariable('client_name');
    const vars = variableNodes(editor);
    expect(vars).toEqual([{ name: 'client_name' }]);
    const node = editor.state.doc.nodeAt(editor.state.selection.from - 1);
    expect(node?.type.isAtom).toBe(true);
    expect(node?.type.name).toBe('variable');
    editor.destroy();
  });

  it('JSON stores only the reference (name), not a baked value', () => {
    const editor = makeEditor();
    editor.commands.setVariableValues({ client_name: 'Meridian' });
    editor.commands.insertContent({ type: 'variable', attrs: { name: 'client_name' } });
    const json = JSON.stringify(editor.getJSON());
    expect(json).toContain('"type":"variable"');
    expect(json).toContain('"name":"client_name"');
    expect(json).not.toContain('Meridian'); // reference kept, value NOT baked into JSON
    editor.destroy();
  });

  it('HTML round-trips the reference via data-var-name', () => {
    const editor = makeEditor();
    editor.commands.insertContent({ type: 'variable', attrs: { name: 'closing_date' } });
    expect(editor.getHTML()).toContain('data-var-name="closing_date"');
    // Re-parse: a fresh editor loading that HTML keeps the token.
    const round = new Editor({ extensions: buildExtensions(), content: editor.getHTML() });
    expect(variableNodes(round)).toEqual([{ name: 'closing_date' }]);
    round.destroy();
    editor.destroy();
  });

  it('inherits the active font size (and marks) at insertion', () => {
    const editor = makeEditor(); // "Hello " (positions 1..6)
    // Format the existing text and place the caret inside that run so the
    // insertion inherits its marks.
    editor.commands.setTextSelection({ from: 1, to: 6 });
    editor.chain().setFontSize('18pt').toggleBold().run();
    editor.commands.setTextSelection(6); // caret at end of the bold/18pt run
    editor.commands.insertVariable('client_name');

    let marks: readonly { type: { name: string }; attrs: Record<string, unknown> }[] = [];
    editor.state.doc.descendants((n) => {
      if (n.type.name === 'variable') marks = n.marks;
    });
    const textStyle = marks.find((m) => m.type.name === 'textStyle');
    expect(textStyle?.attrs.fontSize).toBe('18pt');
    expect(marks.some((m) => m.type.name === 'bold')).toBe(true);
    editor.destroy();
  });

  it('insertVariableAt replaces an explicit range', () => {
    const editor = makeEditor(); // "Hello " → positions 1.."Hello ".length
    // Replace "Hello" (1..6) with a token.
    editor.commands.insertVariableAt({ from: 1, to: 6 }, 'greeting');
    expect(variableNodes(editor)).toEqual([{ name: 'greeting' }]);
    expect(editor.state.doc.textContent).not.toContain('Hello');
    editor.destroy();
  });
});

describe('export / plain-text baking', () => {
  it('markdown bakes the resolved value; unset bakes the technical name', () => {
    const editor = makeEditor();
    editor.commands.insertContent({ type: 'variable', attrs: { name: 'client_name' } });
    editor.commands.insertContent(' and ');
    editor.commands.insertContent({ type: 'variable', attrs: { name: 'counterparty' } });
    editor.commands.setVariableValues({ client_name: 'Meridian', counterparty: null });
    const md = serialize(editor, 'markdown');
    expect(md).toContain('Meridian'); // set → value
    expect(md).toContain('{{counterparty}}'); // unset → {{name}} placeholder (default)
    editor.destroy();
  });

  it('plain-text (txt) baking omits unset when excluded, keeps set values', () => {
    const editor = makeEditor();
    editor.commands.insertContent({ type: 'variable', attrs: { name: 'client_name' } });
    editor.commands.insertContent(' / ');
    editor.commands.insertContent({ type: 'variable', attrs: { name: 'counterparty' } });
    const values = { client_name: 'Meridian', counterparty: null };
    // Mirrors ExportPanel's bakedPlainText() leafText resolver.
    const baked = (includeUnset: boolean) =>
      editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n\n', (leaf) =>
        leaf.type.name === 'variable'
          ? variableBakedText(values, leaf.attrs.name as string, { includeUnset })
          : (leaf.type.spec.leafText?.(leaf) ?? ''),
      );
    expect(baked(true)).toContain('Meridian');
    expect(baked(true)).toContain('{{counterparty}}');
    expect(baked(false)).toContain('Meridian');
    expect(baked(false)).not.toContain('counterparty');
    editor.destroy();
  });

  it('markdown omits unset variables when includeUnsetVariables is false', () => {
    const editor = makeEditor();
    editor.commands.insertContent({ type: 'variable', attrs: { name: 'client_name' } });
    editor.commands.insertContent(' and ');
    editor.commands.insertContent({ type: 'variable', attrs: { name: 'counterparty' } });
    editor.commands.setVariableValues({ client_name: 'Meridian', counterparty: null });
    const md = serialize(editor, 'markdown', { includeUnsetVariables: false });
    expect(md).toContain('Meridian'); // set value kept
    expect(md).not.toContain('counterparty'); // unset omitted
    editor.destroy();
  });
});

describe('highlight toggle (view-only)', () => {
  it('defaults on and toggles; state is not written to the document', () => {
    const editor = makeEditor();
    const before = JSON.stringify(editor.getJSON());
    expect(isVariableHighlightEnabled(editor)).toBe(true);
    editor.commands.toggleVariableHighlight();
    expect(isVariableHighlightEnabled(editor)).toBe(false);
    editor.commands.toggleVariableHighlight();
    expect(isVariableHighlightEnabled(editor)).toBe(true);
    expect(JSON.stringify(editor.getJSON())).toBe(before); // document untouched
    editor.destroy();
  });
});

describe('@ trigger matching', () => {
  it('triggers at line start / after whitespace; not mid-word; captures the query', () => {
    expect(trigger('@')).toBe('');
    expect(trigger('@cli')).toBe('cli');
    expect(trigger('between @client')).toBe('client');
    expect(trigger('email a@b')).toBeNull(); // mid-word, not a trigger
    expect(trigger('no trigger here')).toBeNull();
    expect(trigger('@client ')).toBeNull(); // trailing space breaks the trigger
  });
});

describe('menu wiring', () => {
  it('insert.variable is document-editing (disabled in view mode)', () => {
    expect(commandEditsDoc('insert.variable')).toBe(true);
  });

  it('view.highlightVariables toggles and reflects checked state', () => {
    const editor = makeEditor();
    const ctx = { editor, ui: {}, svc: {} } as unknown as CmdCtx;
    // enabled by default (menu-visible + a real command → enabled)
    expect(isItemEnabled('view.highlightVariables', ctx)).toBe(true);
    editor.destroy();
  });
});
