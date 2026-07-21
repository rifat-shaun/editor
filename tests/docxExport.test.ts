import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { LevelFormat } from 'docx';
import { orderedLevels, bulletLevels, levelFormatFor } from '../src/editor/export/docx/numbering';
import { exportDocxBuffer, buildDocument, type BuildOptions } from '../src/editor/export/docx';
import { resolveWordFont, boldFromWeight, DEFAULT_FONT_THEME, bodySizeHalfPoints } from '../src/editor/export/docx/fontTheme';
import { fontSizeToHalfPoints } from '../src/editor/export/docx/units';
import { getPreset, extendDefinition } from '../src/editor/extensions/listNumbering/model';
import { getBulletPreset } from '../src/editor/extensions/bulletList/model';
import { Packer } from 'docx';
import type { PMNode } from '../src/editor/export/docx/convert';

/* ------------------------- numbering mapping (unit) ------------------------ */

describe('numbering mapping', () => {
  it('maps numFmt strings to docx LevelFormat', () => {
    expect(levelFormatFor('decimal')).toBe(LevelFormat.DECIMAL);
    expect(levelFormatFor('lowerLetter')).toBe(LevelFormat.LOWER_LETTER);
    expect(levelFormatFor('upperRoman')).toBe(LevelFormat.UPPER_ROMAN);
    expect(levelFormatFor('decimalZero')).toBe(LevelFormat.DECIMAL_ZERO);
  });

  it('ordered "decimal" preset → per-level formats + templates', () => {
    const lv = orderedLevels(extendDefinition(getPreset('decimal')!.levels));
    expect(lv[0]).toMatchObject({ level: 0, format: LevelFormat.DECIMAL, text: '%1.', start: 1 });
    expect(lv[1]).toMatchObject({ level: 1, format: LevelFormat.LOWER_LETTER, text: '%2.' });
    expect(lv[2]).toMatchObject({ level: 2, format: LevelFormat.LOWER_ROMAN, text: '%3.' });
  });

  it('legal preset → composite multilevel templates (make-or-break)', () => {
    const lv = orderedLevels(extendDefinition(getPreset('legal')!.levels));
    expect(lv[0]).toMatchObject({ format: LevelFormat.DECIMAL, text: '%1.' });
    expect(lv[1]).toMatchObject({ format: LevelFormat.DECIMAL, text: '%1.%2.' });
    expect(lv[2]).toMatchObject({ format: LevelFormat.DECIMAL, text: '%1.%2.%3.' });
  });

  it('bullet preset → BULLET format + glyph', () => {
    const lv = bulletLevels(getBulletPreset('arrow')!.levels);
    expect(lv[0]).toMatchObject({ level: 0, format: LevelFormat.BULLET, text: '→' });
    expect(lv[1]).toMatchObject({ format: LevelFormat.BULLET, text: '–' });
  });
});

/* --------------------------- integration (pack) --------------------------- */

async function pack(doc: PMNode, opts: BuildOptions = {}) {
  const buf = await exportDocxBuffer(doc, { title: 'Test', ...opts });
  expect(buf[0]).toBe(0x50); // 'P' — valid ZIP
  const zip = await JSZip.loadAsync(buf);
  const read = async (p: string) => (zip.file(p) ? await zip.file(p)!.async('text') : '');
  return {
    document: await read('word/document.xml'),
    numbering: await read('word/numbering.xml'),
    styles: await read('word/styles.xml'),
  };
}

const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });

/* ----------------------------- font theme -------------------------------- */

describe('font-size convention — points-source (pt end-to-end), one helper', () => {
  it('points pass 1:1 to half-points (× 2)', () => {
    expect(fontSizeToHalfPoints(21)).toBe(42); // Title 21pt
    expect(fontSizeToHalfPoints(18)).toBe(36); // H2
    expect(fontSizeToHalfPoints(15)).toBe(30); // H3
    expect(fontSizeToHalfPoints(12)).toBe(24); // H4 / Body
    expect(fontSizeToHalfPoints('21pt')).toBe(42);
    expect(fontSizeToHalfPoints('13pt')).toBe(26);
    // imported px content → visual-parity pt (× 0.75 → × 2)
    expect(fontSizeToHalfPoints('28px')).toBe(42);
    expect(fontSizeToHalfPoints('16px')).toBe(24);
    expect(fontSizeToHalfPoints(null)).toBeNull();
  });

  it('the theme (headings + body) resolves through the single helper', () => {
    const t = DEFAULT_FONT_THEME;
    expect([1, 2, 3, 4].map((l) => fontSizeToHalfPoints(t.headings[l as 1].sizePt))).toEqual([42, 36, 30, 24]);
    expect(bodySizeHalfPoints(t)).toBe(24); // 12pt body
  });
});

describe('font theme', () => {
  it('resolves CSS fonts/stacks to one Word font', () => {
    expect(resolveWordFont('Georgia, "Times New Roman", serif')).toBe('Georgia');
    expect(resolveWordFont('system-ui, sans-serif')).toBe('Calibri'); // substituted
    expect(resolveWordFont('Roboto')).toBe('Arial'); // web font → substitute
    expect(resolveWordFont('Times New Roman')).toBe('Times New Roman');
    expect(resolveWordFont('')).toBeNull();
  });
  it('collapses numeric weight to bold at ≥600', () => {
    expect(boldFromWeight(700)).toBe(true);
    expect(boldFromWeight(600)).toBe(true);
    expect(boldFromWeight(500)).toBe(false);
    expect(boldFromWeight('bold')).toBe(true);
  });

  it('document default run + heading styles use the theme fonts/sizes', async () => {
    const { styles } = await pack({ type: 'doc', content: [p('x')] });
    // Default run: Times New Roman @ 24 half-points (12pt), body color.
    expect(styles).toMatch(/<w:rFonts[^>]*w:ascii="Times New Roman"/);
    expect(styles).toMatch(/w:sz w:val="24"/);
    // Heading 1: Times New Roman, 42 half-points (21pt), bold.
    expect(styles).toMatch(/w:styleId="Heading1"[\s\S]*?w:sz w:val="42"/);
  });

  it('bodyFontOverride (the editor Font-select choice) wins for body', async () => {
    const { styles } = await pack({ type: 'doc', content: [p('x')] }, { bodyFontOverride: 'Arial' });
    expect(styles).toMatch(/<w:docDefaults>[\s\S]*?w:ascii="Arial"/);
  });
});

/* ---------------------------- page settings ------------------------------ */

describe('page section respects real settings', () => {
  it('exports A4 dimensions when supplied', async () => {
    const doc = buildDocument(
      { type: 'doc', content: [p('a')] },
      { page: { widthTwip: 11910, heightTwip: 16845, margin: { top: 1440, right: 1080, bottom: 1440, left: 1080 } } },
    );
    const buf = await Packer.toBuffer(doc);
    const zip = await JSZip.loadAsync(buf);
    const document = await zip.file('word/document.xml')!.async('text');
    expect(document).toMatch(/<w:pgSz w:w="11910" w:h="16845"/);
    expect(document).toMatch(/w:left="1080"/);
  });
});

describe('full pipeline → OOXML parts', () => {
  it('empty document packs to a valid file with a paragraph', async () => {
    const { document } = await pack({ type: 'doc', content: [] });
    expect(document).toMatch(/<w:document/);
    expect(document).toMatch(/<w:p\b/);
  });

  it('marks map to run properties (bold+italic+link on one run)', async () => {
    const doc: PMNode = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'link',
              marks: [
                { type: 'bold' },
                { type: 'italic' },
                { type: 'link', attrs: { href: 'https://example.com' } },
              ],
            },
          ],
        },
      ],
    };
    const { document } = await pack(doc);
    expect(document).toMatch(/<w:hyperlink/);
    expect(document).toMatch(/<w:b\b|<w:b\/>/);
    expect(document).toMatch(/<w:i\b|<w:i\/>/);
  });

  it('nested composite ordered list → numbering.xml with multilevel templates', async () => {
    const legalId = 'ldlegal';
    const legalDef = extendDefinition(getPreset('legal')!.levels);
    const li = (text: string, sub?: PMNode) => ({
      type: 'listItem',
      content: [p(text), ...(sub ? [sub] : [])],
    });
    const doc: PMNode = {
      type: 'doc',
      attrs: { listDefs: { [legalId]: legalDef }, bulletDefs: {} },
      content: [
        {
          type: 'orderedList',
          attrs: { listDefId: legalId },
          content: [
            li('One', {
              type: 'orderedList',
              attrs: { listDefId: legalId },
              content: [li('One-one')],
            }),
          ],
        },
      ],
    };
    const { document, numbering } = await pack(doc);
    expect(numbering).toMatch(/w:val="%1\.%2\."/); // composite level-2 template
    expect(numbering).toMatch(/w:numFmt w:val="decimal"/);
    // Paragraphs reference the numbering at the right levels.
    expect(document).toMatch(/<w:ilvl w:val="0"/);
    expect(document).toMatch(/<w:ilvl w:val="1"/);
  });

  it('table with colspan + rowspan → gridSpan + vMerge', async () => {
    const cell = (text: string, attrs: Record<string, unknown> = {}) => ({
      type: 'tableCell',
      attrs: { colspan: 1, rowspan: 1, colwidth: [120], ...attrs },
      content: [p(text)],
    });
    const doc: PMNode = {
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [cell('merged wide', { colspan: 2, colwidth: [120, 120] }), cell('tall', { rowspan: 2 })],
            },
            { type: 'tableRow', content: [cell('a'), cell('b')] },
          ],
        },
      ],
    };
    const { document } = await pack(doc);
    expect(document).toMatch(/<w:tbl>/);
    expect(document).toMatch(/<w:gridSpan w:val="2"/); // colspan
    expect(document).toMatch(/<w:vMerge w:val="restart"/); // rowspan start
    expect(document).toMatch(/<w:vMerge w:val="continue"|<w:vMerge\/>/); // rowspan continue
    // Column widths preserved (120px → 1800 twips), not equal-split.
    expect(document).toMatch(/<w:gridCol w:w="1800"/);
  });

  it('centers the H1 title by default (editor CSS centers h1)', async () => {
    const { document } = await pack({
      type: 'doc',
      content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] }],
    });
    expect(document).toMatch(/<w:jc w:val="center"/);
  });

  it('does NOT center non-h1 headings or plain paragraphs by default', async () => {
    const { document } = await pack({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'H2' }] },
        p('body'),
      ],
    });
    expect(document).not.toMatch(/<w:jc w:val="center"/);
  });

  it('respects an explicit alignment override on H1 (left)', async () => {
    const { document } = await pack({
      type: 'doc',
      content: [{ type: 'heading', attrs: { level: 1, textAlign: 'left' }, content: [{ type: 'text', text: 'L' }] }],
    });
    expect(document).not.toMatch(/<w:jc w:val="center"/);
  });

  it('page-break node → a hard page break', async () => {
    const doc: PMNode = { type: 'doc', content: [p('before'), { type: 'pageBreak' }, p('after')] };
    const { document } = await pack(doc);
    expect(document).toMatch(/<w:br w:type="page"\/>/);
  });

  it('explicit list start (Restart numbering) → level-0 start override', async () => {
    const def = extendDefinition(getPreset('decimal')!.levels);
    const doc: PMNode = {
      type: 'doc',
      attrs: { listDefs: { L: def }, bulletDefs: {} },
      content: [
        {
          type: 'orderedList',
          attrs: { listDefId: 'L', start: 5 },
          content: [{ type: 'listItem', content: [p('five')] }],
        },
      ],
    };
    const { numbering } = await pack(doc);
    expect(numbering).toMatch(/<w:start w:val="5"/);
  });


  it('every OOXML part is well-formed XML (guards against Word "repair")', async () => {
    const legalDef = extendDefinition(getPreset('legal')!.levels);
    const doc: PMNode = {
      type: 'doc',
      attrs: { listDefs: { L: legalDef }, bulletDefs: { B: [{ markerStyle: 'arrow' }] } },
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] },
        p('Body with a link and marks.'),
        {
          type: 'orderedList',
          attrs: { listDefId: 'L' },
          content: [{ type: 'listItem', content: [p('One')] }],
        },
        {
          type: 'bulletList',
          attrs: { bulletDefId: 'B' },
          content: [{ type: 'listItem', content: [p('Bullet')] }],
        },
        {
          type: 'table',
          content: [
            { type: 'tableRow', content: [{ type: 'tableHeader', attrs: { colspan: 1, rowspan: 1, colwidth: [200] }, content: [p('H')] }] },
            { type: 'tableRow', content: [{ type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: [200] }, content: [p('C')] }] },
          ],
        },
      ],
    };
    const buf = await exportDocxBuffer(doc, { title: 'WF' });
    const zip = await JSZip.loadAsync(buf);
    const xmlParts = Object.keys(zip.files).filter((n) => n.endsWith('.xml') || n.endsWith('.rels'));
    expect(xmlParts.length).toBeGreaterThan(3);
    const parser = new DOMParser();
    for (const name of xmlParts) {
      const xml = await zip.file(name)!.async('text');
      const parsed = parser.parseFromString(xml, 'application/xml');
      expect(parsed.getElementsByTagName('parsererror').length, `${name} malformed`).toBe(0);
    }
  });

  it('every numbering reference in the body resolves in numbering.xml (no dangling refs)', async () => {
    const legalDef = extendDefinition(getPreset('legal')!.levels);
    const doc: PMNode = {
      type: 'doc',
      attrs: { listDefs: { L: legalDef }, bulletDefs: { B: [{ markerStyle: 'arrow' }] } },
      content: [
        { type: 'orderedList', attrs: { listDefId: 'L' }, content: [{ type: 'listItem', content: [p('a')] }] },
        { type: 'bulletList', attrs: { bulletDefId: 'B' }, content: [{ type: 'listItem', content: [p('b')] }] },
      ],
    };
    const { document, numbering } = await pack(doc);
    const usedNumIds = [...document.matchAll(/<w:numId w:val="(\d+)"/g)].map((m) => m[1]);
    expect(usedNumIds.length).toBeGreaterThan(0);
    const definedNumIds = new Set([...numbering.matchAll(/<w:num w:numId="(\d+)"/g)].map((m) => m[1]));
    for (const id of usedNumIds) expect(definedNumIds.has(id!), `numId ${id} dangling`).toBe(true);
  });

  it('bullet list with custom glyph packs', async () => {
    const doc: PMNode = {
      type: 'doc',
      attrs: { listDefs: {}, bulletDefs: { bd1: [{ markerStyle: 'arrow' }] } },
      content: [
        {
          type: 'bulletList',
          attrs: { bulletDefId: 'bd1' },
          content: [{ type: 'listItem', content: [p('arrow item')] }],
        },
      ],
    };
    const { numbering } = await pack(doc);
    expect(numbering).toMatch(/w:numFmt w:val="bullet"/);
    expect(numbering).toMatch(/w:val="→"/);
  });
});

/* ------------------------------ line spacing ------------------------------ */

describe('line-height → Word line spacing (integration)', () => {
  it('emits AUTO spacing for a unitless multiplier on a paragraph', async () => {
    const doc = {
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { lineHeight: '1.5' }, content: [{ type: 'text', text: 'spaced' }] }],
    };
    const { document } = await pack(doc);
    expect(document).toMatch(/w:spacing[^>]*w:line="360"[^>]*w:lineRule="auto"/);
  });

  it('emits AUTO spacing on a heading and EXACT for a px value', async () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2, lineHeight: '2' }, content: [{ type: 'text', text: 'H' }] },
        { type: 'paragraph', attrs: { lineHeight: '24px' }, content: [{ type: 'text', text: 'exact' }] },
      ],
    };
    const { document } = await pack(doc);
    expect(document).toMatch(/w:line="480"[^>]*w:lineRule="auto"/);
    expect(document).toMatch(/w:line="360"[^>]*w:lineRule="exact"/);
  });

  it('omits spacing when no line height is set', async () => {
    const { document } = await pack({ type: 'doc', content: [p('plain')] });
    expect(document).not.toMatch(/w:lineRule/);
  });

  it('emits paragraph space before/after as twips (12pt → 240)', async () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { spaceBefore: '12pt', spaceAfter: '6pt' },
          content: [{ type: 'text', text: 'spaced' }],
        },
      ],
    };
    const { document } = await pack(doc);
    expect(document).toMatch(/w:spacing[^>]*w:before="240"/);
    expect(document).toMatch(/w:spacing[^>]*w:after="120"/);
  });

  it('merges line height + space before/after on one paragraph', async () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { lineHeight: '1.5', spaceBefore: '18pt', spaceAfter: '0pt' },
          content: [{ type: 'text', text: 'x' }],
        },
      ],
    };
    const { document } = await pack(doc);
    expect(document).toMatch(/w:before="360"/); // 18pt
    expect(document).toMatch(/w:after="0"/);
    expect(document).toMatch(/w:line="360"[^>]*w:lineRule="auto"/); // 1.5
  });

  it('emits paragraph indent as twips (1px = 15tw); signed first-line → firstLine/hanging', async () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { indentLeft: 96, indentRight: 48, indentFirstLine: 48 }, content: [{ type: 'text', text: 'a' }] },
        { type: 'paragraph', attrs: { indentLeft: 96, indentFirstLine: -48 }, content: [{ type: 'text', text: 'b' }] },
      ],
    };
    const { document } = await pack(doc);
    expect(document).toMatch(/w:ind[^>]*w:left="1440"/); // 96px → 1in
    expect(document).toMatch(/w:ind[^>]*w:right="720"/);
    expect(document).toMatch(/w:ind[^>]*w:firstLine="720"/); // +48px
    expect(document).toMatch(/w:ind[^>]*w:hanging="720"/); // -48px
  });
});
