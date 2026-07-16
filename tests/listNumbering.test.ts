import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { buildExtensions } from '../src/editor/extensionsList';
import {
  formatValue,
  renderMarker,
  extendDefinition,
  getPreset,
  type ListDefinition,
} from '../src/editor/extensions/listNumbering/model';
import { markerContent, cssCounterStyle } from '../src/editor/extensions/listNumbering/counterCss';
import {
  ooxmlNumFmt,
  ooxmlLevelText,
  toAbstractNum,
} from '../src/editor/extensions/listNumbering/docxNumbering';
import {
  getActiveListInfo,
  findOrderedListContext,
} from '../src/editor/extensions/listNumbering/extension';

/* ------------------------------ value → text ------------------------------ */

describe('formatValue — every number style', () => {
  it('decimal', () => expect([1, 2, 10].map((n) => formatValue(n, 'decimal'))).toEqual(['1', '2', '10']));
  it('decimalZero', () =>
    expect([1, 9, 10].map((n) => formatValue(n, 'decimalZero'))).toEqual(['01', '09', '10']));
  it('lowerAlpha', () =>
    expect([1, 26, 27].map((n) => formatValue(n, 'lowerAlpha'))).toEqual(['a', 'z', 'aa']));
  it('upperAlpha', () =>
    expect([1, 26, 28].map((n) => formatValue(n, 'upperAlpha'))).toEqual(['A', 'Z', 'AB']));
  it('lowerRoman', () =>
    expect([1, 4, 9, 14].map((n) => formatValue(n, 'lowerRoman'))).toEqual(['i', 'iv', 'ix', 'xiv']));
  it('upperRoman', () =>
    expect([1, 4, 40].map((n) => formatValue(n, 'upperRoman'))).toEqual(['I', 'IV', 'XL']));
});

/* --------------------------- marker composition --------------------------- */

describe('renderMarker — separators & parent inclusion', () => {
  const dec = extendDefinition(getPreset('decimal')!.levels);
  it('non-inclusive, period', () => {
    expect(renderMarker(dec, 1, [1])).toBe('1.');
    expect(renderMarker(dec, 2, [1, 1])).toBe('a.');
    expect(renderMarker(dec, 3, [1, 1, 1])).toBe('i.');
  });

  const paren = extendDefinition(getPreset('paren')!.levels);
  it('paren separator', () => {
    expect(renderMarker(paren, 1, [1])).toBe('1)');
    expect(renderMarker(paren, 2, [2, 3])).toBe('c)');
  });

  it('parens separator', () => {
    const parens: ListDefinition = [
      { style: 'lowerAlpha', separator: 'parens', startAt: 1, includeParent: false },
    ];
    expect(renderMarker(parens, 1, [2])).toBe('(b)');
  });

  const legal = extendDefinition(getPreset('legal')!.levels);
  it('legal composite (parent-inclusive at every level)', () => {
    expect(renderMarker(legal, 1, [1])).toBe('1.');
    expect(renderMarker(legal, 2, [1, 1])).toBe('1.1.');
    expect(renderMarker(legal, 3, [1, 2, 1])).toBe('1.2.1.');
  });

  it('mixed-style composite (decimal parent + alpha child): 1.a', () => {
    const mixed: ListDefinition = [
      { style: 'decimal', separator: 'dot', startAt: 1, includeParent: false },
      { style: 'lowerAlpha', separator: 'dot', startAt: 1, includeParent: true },
      { style: 'lowerRoman', separator: 'dot', startAt: 1, includeParent: true },
    ];
    expect(renderMarker(mixed, 2, [1, 1])).toBe('1.a.');
    expect(renderMarker(mixed, 3, [1, 1, 1])).toBe('1.a.i.');
  });

  it('startAt shifts the displayed value', () => {
    const def: ListDefinition = [
      { style: 'decimal', separator: 'dot', startAt: 5, includeParent: false },
    ];
    // 3rd item when starting at 5 → value 7.
    expect(renderMarker(def, 1, [7])).toBe('7.');
    expect(formatValue(def[0]!.startAt, def[0]!.style)).toBe('5');
  });
});

/* ------------------------------ CSS generation ---------------------------- */

describe('CSS counters', () => {
  it('maps every style to a CSS counter keyword', () => {
    expect(cssCounterStyle('decimalZero')).toBe('decimal-leading-zero');
    expect(cssCounterStyle('lowerAlpha')).toBe('lower-alpha');
    expect(cssCounterStyle('upperRoman')).toBe('upper-roman');
  });

  it('non-inclusive uses a single counter()', () => {
    const dec = extendDefinition(getPreset('decimal')!.levels);
    expect(markerContent(dec, 2)).toBe('counter(pgnol2, lower-alpha) "."');
  });

  it('legal composite chains counters with the same style', () => {
    const legal = extendDefinition(getPreset('legal')!.levels);
    expect(markerContent(legal, 3)).toBe(
      'counter(pgnol1, decimal) "." counter(pgnol2, decimal) "." counter(pgnol3, decimal) "."',
    );
  });

  it('mixed composite chains DIFFERENT styles (what counters() cannot do)', () => {
    const mixed: ListDefinition = [
      { style: 'decimal', separator: 'dot', startAt: 1, includeParent: false },
      { style: 'lowerAlpha', separator: 'dot', startAt: 1, includeParent: true },
    ];
    expect(markerContent(mixed, 2)).toBe('counter(pgnol1, decimal) "." counter(pgnol2, lower-alpha) "."');
  });
});

/* ------------------------------ DOCX mapping ------------------------------ */

describe('DOCX numbering mapping', () => {
  it('maps number styles to OOXML numFmt', () => {
    expect(ooxmlNumFmt('lowerAlpha')).toBe('lowerLetter');
    expect(ooxmlNumFmt('upperAlpha')).toBe('upperLetter');
    expect(ooxmlNumFmt('decimalZero')).toBe('decimalZero');
    expect(ooxmlNumFmt('lowerRoman')).toBe('lowerRoman');
  });

  it('lvlText uses %n placeholders and composites for parent-inclusive', () => {
    const legal = extendDefinition(getPreset('legal')!.levels);
    expect(ooxmlLevelText(legal, 1)).toBe('%1.');
    expect(ooxmlLevelText(legal, 2)).toBe('%1.%2.');
    expect(ooxmlLevelText(legal, 3)).toBe('%1.%2.%3.');
    const dec = extendDefinition(getPreset('decimal')!.levels);
    expect(ooxmlLevelText(dec, 2)).toBe('%2.');
  });

  it('abstractNum has 9 levels with start + numFmt', () => {
    const a = toAbstractNum('x', getPreset('zero')!.levels);
    expect(a.levels).toHaveLength(9);
    expect(a.levels[0]).toMatchObject({ level: 0, numFmt: 'decimalZero', lvlText: '%1.', start: 1 });
  });
});

/* -------------------- integration: commands + round-trip ------------------ */

function makeListEditor() {
  return new Editor({
    extensions: buildExtensions(),
    content: {
      type: 'doc',
      content: [
        {
          type: 'orderedList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'two' }] }] },
          ],
        },
      ],
    },
  });
}

function putCursorInList(editor: Editor) {
  // Place the cursor inside the first list item's text.
  let target = 1;
  editor.state.doc.descendants((node, pos) => {
    if (node.isText && node.text === 'one') target = pos + 1;
    return true;
  });
  editor.commands.setTextSelection(target);
}

describe('commands + JSON round-trip', () => {
  it('applyListPreset registers a def and stamps the list; getJSON round-trips it', () => {
    const editor = makeListEditor();
    putCursorInList(editor);
    expect(findOrderedListContext(editor.state)).not.toBeNull();

    const ok = editor.commands.applyListPreset('legal');
    expect(ok).toBe(true);

    const info = getActiveListInfo(editor);
    expect(info).not.toBeNull();
    expect(info!.presetId).toBe('legal');
    expect(info!.definition[0]).toMatchObject({ style: 'decimal', includeParent: true });

    // Registry lives on the doc attr and survives a JSON round-trip.
    const json = editor.getJSON();
    expect(json.attrs && Object.keys(json.attrs.listDefs).length).toBeGreaterThan(0);

    const reloaded = new Editor({ extensions: buildExtensions(), content: json });
    const reg = reloaded.state.doc.attrs.listDefs as Record<string, ListDefinition>;
    expect(Object.keys(reg).length).toBeGreaterThan(0);
    const defId = info!.defId!;
    expect(reg[defId]).toBeTruthy();
    reloaded.destroy();
    editor.destroy();
  });

  it('setLevelIncludeParent copy-on-writes a new def for that list only', () => {
    const editor = makeListEditor();
    putCursorInList(editor);
    editor.commands.applyListPreset('decimal');
    const before = getActiveListInfo(editor)!.defId;
    editor.commands.setLevelIncludeParent(2, true);
    const after = getActiveListInfo(editor)!;
    expect(after.defId).not.toBe(before); // new id (copy-on-write)
    expect(after.definition[1]).toMatchObject({ includeParent: true });
    editor.destroy();
  });

  it('commands are disabled outside an ordered list', () => {
    const editor = new Editor({
      extensions: buildExtensions(),
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }] },
    });
    editor.commands.setTextSelection(1);
    expect(editor.can().applyListPreset('legal')).toBe(false);
    expect(getActiveListInfo(editor)).toBeNull();
    editor.destroy();
  });
});
