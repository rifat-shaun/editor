import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { buildExtensions } from '../src/editor/extensionsList';
import {
  markerGlyph,
  getBulletPreset,
  extendBulletDefinition,
  type BulletDefinition,
} from '../src/editor/extensions/bulletList/model';
import { generateBulletDefinitionCss } from '../src/editor/extensions/bulletList/bulletCss';
import {
  ooxmlBulletText,
  toBulletAbstractNum,
} from '../src/editor/extensions/listNumbering/docxNumbering';
import {
  getActiveBulletInfo,
  findBulletListContext,
} from '../src/editor/extensions/bulletList/extension';

/* ------------------------------ CSS generation ---------------------------- */

describe('generateBulletDefinitionCss', () => {
  it('native styles use list-style-type', () => {
    const css = generateBulletDefinitionCss('x', [{ markerStyle: 'circle' }]);
    expect(css).toMatch(/ul\[data-bullet-def="x"\]\[data-bullet-level="1"\]\{list-style-type:circle;\}/);
  });

  it('dash / arrow / custom render a ::before glyph', () => {
    expect(generateBulletDefinitionCss('x', [{ markerStyle: 'dash' }])).toMatch(/::before\{content:"–"/);
    expect(generateBulletDefinitionCss('x', [{ markerStyle: 'arrow' }])).toMatch(/::before\{content:"→"/);
    expect(generateBulletDefinitionCss('x', [{ markerStyle: 'custom', customMarker: '✓' }])).toMatch(
      /::before\{content:"✓"/,
    );
  });

  it('none removes the marker but keeps indentation', () => {
    const css = generateBulletDefinitionCss('x', [{ markerStyle: 'none' }]);
    expect(css).toMatch(/list-style:none;/);
    expect(css).toMatch(/::before\{content:none;\}/);
  });

  it('applies color and size', () => {
    const css = generateBulletDefinitionCss('x', [{ markerStyle: 'dash', color: '#ff0000', size: '1.4em' }]);
    expect(css).toMatch(/color:#ff0000;/);
    expect(css).toMatch(/font-size:1\.4em;/);
  });

  it('generates a rule per depth level', () => {
    const css = generateBulletDefinitionCss('x', extendBulletDefinition(getBulletPreset('classic')!.levels));
    expect(css).toMatch(/data-bullet-level="1"\]\{list-style-type:disc;\}/);
    expect(css).toMatch(/data-bullet-level="2"\]\{list-style-type:circle;\}/);
    expect(css).toMatch(/data-bullet-level="3"\]\{list-style-type:square;\}/);
  });

  it('escapes a double-quote custom glyph', () => {
    const css = generateBulletDefinitionCss('x', [{ markerStyle: 'custom', customMarker: '"' }]);
    expect(css).toMatch(/content:"\\""/);
  });
});

describe('markerGlyph', () => {
  it('maps styles to glyphs; custom falls back when empty', () => {
    expect(markerGlyph({ markerStyle: 'dash' })).toBe('–');
    expect(markerGlyph({ markerStyle: 'arrow' })).toBe('→');
    expect(markerGlyph({ markerStyle: 'custom', customMarker: '▸' })).toBe('▸');
    expect(markerGlyph({ markerStyle: 'custom', customMarker: '' })).toBe('•');
    expect(markerGlyph({ markerStyle: 'none' })).toBe('');
  });
});

/* ------------------------------ DOCX mapping ------------------------------ */

describe('DOCX bullet mapping', () => {
  it('maps markers to Word bullet glyphs', () => {
    expect(ooxmlBulletText({ markerStyle: 'disc' })).toBe('•');
    expect(ooxmlBulletText({ markerStyle: 'circle' })).toBe('o');
    expect(ooxmlBulletText({ markerStyle: 'dash' })).toBe('–');
    expect(ooxmlBulletText({ markerStyle: 'none' })).toBe('');
  });

  it('abstractNum has 9 bullet levels', () => {
    const a = toBulletAbstractNum('x', getBulletPreset('arrow')!.levels);
    expect(a.levels).toHaveLength(9);
    expect(a.levels[0]).toMatchObject({ level: 0, numFmt: 'bullet', lvlText: '→' });
  });
});

/* -------------------- integration: commands + round-trip ------------------ */

function makeBulletEditor() {
  return new Editor({
    extensions: buildExtensions(),
    content: {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'b' }] }] },
          ],
        },
      ],
    },
  });
}

function cursorInList(editor: Editor) {
  let target = 1;
  editor.state.doc.descendants((node, pos) => {
    if (node.isText && node.text === 'a') target = pos + 1;
    return true;
  });
  editor.commands.setTextSelection(target);
}

describe('bullet commands + round-trip', () => {
  it('applyBulletPreset stamps the list and round-trips via JSON', () => {
    const editor = makeBulletEditor();
    cursorInList(editor);
    expect(findBulletListContext(editor.state)).not.toBeNull();
    expect(editor.commands.applyBulletPreset('arrow')).toBe(true);

    const info = getActiveBulletInfo(editor)!;
    expect(info.presetId).toBe('arrow');
    expect(info.definition[0]).toMatchObject({ markerStyle: 'arrow' });

    const json = editor.getJSON();
    expect(Object.keys(json.attrs!.bulletDefs).length).toBeGreaterThan(0);
    const reloaded = new Editor({ extensions: buildExtensions(), content: json });
    const reg = reloaded.state.doc.attrs.bulletDefs as Record<string, BulletDefinition>;
    expect(reg[info.defId!]).toBeTruthy();
    reloaded.destroy();
    editor.destroy();
  });

  it('setBulletLevelCustomMarker copy-on-writes a new def', () => {
    const editor = makeBulletEditor();
    cursorInList(editor);
    editor.commands.applyBulletPreset('classic');
    const before = getActiveBulletInfo(editor)!.defId;
    editor.commands.setBulletLevelCustomMarker(1, '★');
    const after = getActiveBulletInfo(editor)!;
    expect(after.defId).not.toBe(before);
    expect(after.definition[0]).toMatchObject({ markerStyle: 'custom', customMarker: '★' });
    editor.destroy();
  });

  it('commands are disabled outside a bullet list', () => {
    const editor = new Editor({
      extensions: buildExtensions(),
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }] },
    });
    editor.commands.setTextSelection(1);
    expect(editor.can().applyBulletPreset('classic')).toBe(false);
    expect(getActiveBulletInfo(editor)).toBeNull();
    editor.destroy();
  });
});
