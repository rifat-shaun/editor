import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { buildExtensions } from '../src/editor/extensionsList';
import { INDENT_STEP } from '../src/editor/extensions/indent';
import { indentAtSelection } from '../src/components/indentSelection';
import { pxToTwips, formatMeasure, tickSpec, PX_PER_IN, PX_PER_CM } from '../src/components/rulerUnits';

const ext = () => buildExtensions();

function indents(editor: Editor) {
  const out: { left: number; right: number; first: number }[] = [];
  editor.state.doc.descendants((n) => {
    if (n.type.name === 'paragraph' || n.type.name === 'heading')
      out.push({ left: n.attrs.indentLeft || 0, right: n.attrs.indentRight || 0, first: n.attrs.indentFirstLine || 0 });
  });
  return out;
}

describe('Indent extension', () => {
  const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'b' }] }] };

  it('setParagraphIndent sets signed first-line (hanging) + left/right', () => {
    const e = new Editor({ extensions: ext(), content: doc });
    e.commands.setTextSelection(2);
    e.commands.setParagraphIndent({ left: 96, right: 24, firstLine: -48 });
    expect(indents(e)[0]).toEqual({ left: 96, right: 24, first: -48 });
    e.destroy();
  });

  it('indentMore / indentLess step by 0.5in and clamp at 0', () => {
    const e = new Editor({ extensions: ext(), content: doc });
    e.commands.setTextSelection(2);
    e.commands.indentMore();
    expect(indents(e)[0]!.left).toBe(INDENT_STEP);
    e.commands.indentLess();
    e.commands.indentLess();
    expect(indents(e)[0]!.left).toBe(0); // clamped, not negative
    e.destroy();
  });

  it('applies across a multi-block selection', () => {
    const e = new Editor({ extensions: ext(), content: doc });
    e.commands.setTextSelection({ from: 1, to: e.state.doc.content.size - 1 });
    e.commands.indentMore();
    expect(indents(e).map((i) => i.left)).toEqual([INDENT_STEP, INDENT_STEP]);
    e.destroy();
  });

  it('renders + parses inline styles (round-trip)', () => {
    const e = new Editor({ extensions: ext() });
    e.commands.setContent('<p style="margin-left: 96px; margin-right: 24px; text-indent: -48px">x</p>');
    expect(indents(e)[0]).toEqual({ left: 96, right: 24, first: -48 });
    expect(e.getHTML()).toMatch(/margin-left:\s*96px/);
    expect(e.getHTML()).toMatch(/text-indent:\s*-48px/);
    e.destroy();
  });

  it('indentAtSelection reports the caret block; flags mixed', () => {
    const e = new Editor({
      extensions: ext(),
      content: { type: 'doc', content: [
        { type: 'paragraph', attrs: { indentLeft: 48 }, content: [{ type: 'text', text: 'a' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'b' }] },
      ] },
    });
    e.commands.setTextSelection(2);
    expect(indentAtSelection(e)).toMatchObject({ left: 48, mixed: false });
    e.commands.selectAll();
    expect(indentAtSelection(e).mixed).toBe(true);
    e.destroy();
  });
});

describe('ruler units (shared px ↔ measure)', () => {
  it('px → twips matches DOCX (1in = 96px = 1440tw)', () => {
    expect(pxToTwips(PX_PER_IN)).toBe(1440);
    expect(pxToTwips(48)).toBe(720);
  });
  it('formats per unit', () => {
    expect(formatMeasure(96, 'in')).toBe('1"');
    expect(formatMeasure(PX_PER_CM, 'cm')).toBe('1.0 cm');
  });
  it('tick cadence: 1/8in minor·1in major; 0.25cm minor·1cm major', () => {
    expect(tickSpec('in')).toMatchObject({ minorPx: PX_PER_IN / 8, perMajor: 8 });
    expect(tickSpec('cm')).toMatchObject({ minorPx: PX_PER_CM / 4, perMajor: 4 });
  });
});
