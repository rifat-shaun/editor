import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { buildExtensions } from '../src/editor/extensionsList';
import { serialize, deserialize, SCHEMA_VERSION } from '../src/editor/serialize';

const ext = () => buildExtensions();

/* --------------------------------- JSON --------------------------------- */

describe('JSON — canonical, lossless', () => {
  const doc = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2, lineHeight: '1.5', spaceBefore: '12pt' }, content: [{ type: 'text', text: 'Title' }] },
      {
        type: 'orderedList',
        attrs: { listDefId: 'ld1', start: 3 },
        content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'item' }] }] }],
      },
      { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'bolded' }] },
    ],
  };

  it('wraps in a versioned envelope', () => {
    const e = new Editor({ extensions: ext(), content: doc });
    const env = JSON.parse(serialize(e, 'json'));
    expect(env.type).toBe('acme-docs-editor');
    expect(env.version).toBe(SCHEMA_VERSION);
    expect(env.doc.type).toBe('doc');
    e.destroy();
  });

  it('round-trips every custom node/attr exactly (incl. doc-level pageSetup)', () => {
    const e1 = new Editor({ extensions: ext(), content: doc });
    e1.commands.setPageSetup({ orientation: 'landscape', paperSize: 'a4', margins: { top: 0.5, right: 0.5, bottom: 0.5, left: 0.5 }, marginPreset: 'narrow' });
    const json = serialize(e1, 'json');

    const e2 = new Editor({ extensions: ext() });
    deserialize(e2, 'json', json);
    expect(e2.getJSON()).toEqual(e1.getJSON());
    expect((e2.state.doc.attrs.pageSetup as { paperSize: string }).paperSize).toBe('a4');
    e1.destroy();
    e2.destroy();
  });

  it('loads a legacy bare doc (no envelope)', () => {
    const e = new Editor({ extensions: ext() });
    deserialize(e, 'json', JSON.stringify(doc));
    expect(e.getJSON().content?.[0]?.type).toBe('heading');
    e.destroy();
  });

  it('repairs unknown nodes/marks instead of throwing', () => {
    const e = new Editor({ extensions: ext() });
    const foreign = {
      type: 'doc',
      content: [
        { type: 'weirdBlock', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'kept', marks: [{ type: 'blink' }] }] }] },
      ],
    };
    expect(() => deserialize(e, 'json', JSON.stringify(foreign))).not.toThrow();
    // Unknown node unwrapped, unknown mark dropped, text preserved.
    expect(e.getText()).toContain('kept');
    expect(e.getJSON().content?.[0]?.type).toBe('paragraph');
    e.destroy();
  });
});

/* --------------------------------- HTML --------------------------------- */

describe('HTML — interchange', () => {
  const content = '<p style="line-height: 1.5">hello <strong>bold</strong></p>';

  it('round-trip mode is self-contained (wrapper carries out-of-tree meta)', () => {
    const e = new Editor({ extensions: ext(), content });
    e.commands.setPageSetup({ orientation: 'portrait', paperSize: 'legal', margins: { top: 1, right: 1, bottom: 1, left: 1 }, marginPreset: 'normal' });
    const html = serialize(e, 'html', { mode: 'roundtrip' });
    expect(html).toMatch(/data-acme-doc/);
    expect(html).toMatch(/data-doc-meta/);
    expect(html).toMatch(/legal/); // pageSetup embedded
    expect(html).toMatch(/line-height:\s*1\.5/); // per-node styling emitted
    e.destroy();
  });

  it('clean mode strips internal data-* but keeps semantic styling', () => {
    const e = new Editor({ extensions: ext(), content: '<ol data-list-def-id="ld1"><li><p style="line-height: 2">x</p></li></ol>' });
    const html = serialize(e, 'html', { mode: 'clean' });
    expect(html).not.toMatch(/data-/); // internal ids stripped
    expect(html).not.toMatch(/data-acme-doc/);
    expect(html).toMatch(/line-height:\s*2/); // formatting kept
    e.destroy();
  });
});

/* ------------------------------- Markdown ------------------------------- */

describe('Markdown — lossy per policy', () => {
  it('serializes headings, emphasis, code, links, blockquote', () => {
    const e = new Editor({
      extensions: ext(),
      content:
        '<h1>Head</h1><p><strong>b</strong> <em>i</em> <s>s</s> <code>c</code> <a href="https://x.com">l</a></p><blockquote><p>q</p></blockquote>',
    });
    const md = serialize(e, 'markdown');
    expect(md).toMatch(/^# Head/m);
    expect(md).toContain('**b**');
    expect(md).toContain('_i_');
    expect(md).toContain('~~s~~');
    expect(md).toContain('`c`');
    expect(md).toContain('[l](https://x.com)');
    expect(md).toMatch(/^> q/m);
    e.destroy();
  });

  it('ordered list honors start', () => {
    const e = new Editor({
      extensions: ext(),
      content: { type: 'doc', content: [{ type: 'orderedList', attrs: { start: 3 }, content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }] }] }] },
    });
    expect(serialize(e, 'markdown')).toMatch(/^3\. x/m);
    e.destroy();
  });

  it('simple table → GFM pipes', () => {
    const e = new Editor({ extensions: ext() });
    e.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true });
    const md = serialize(e, 'markdown');
    expect(md).toMatch(/\| --- \| --- \|/);
    e.destroy();
  });

  it('htmlFallback: merged table → raw HTML; page break → HTML div', () => {
    const merged = {
      type: 'doc',
      content: [
        { type: 'table', content: [
          { type: 'tableRow', content: [{ type: 'tableHeader', attrs: { colspan: 2, rowspan: 1, colwidth: null }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Merged' }] }] }] },
          { type: 'tableRow', content: [
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }] },
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'b' }] }] },
          ] },
        ] },
        { type: 'pageBreak' },
      ],
    };
    const e = new Editor({ extensions: ext(), content: merged });
    const withHtml = serialize(e, 'markdown', { htmlFallback: true });
    expect(withHtml).toMatch(/<table/);
    expect(withHtml).toContain('page-break-after');
    e.destroy();
  });

  it('pure mode drops unrepresentable marks (underline) but keeps text', () => {
    const e = new Editor({ extensions: ext(), content: '<p><u>plain</u></p>' });
    const md = serialize(e, 'markdown');
    expect(md).toContain('plain');
    expect(md).not.toContain('<u>');
    e.destroy();
  });
});
